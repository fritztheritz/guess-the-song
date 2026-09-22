import { generateCodeChallenge, generateCodeVerifier, generateState } from './pkce'
import {
  SOUNDCLOUD_AUTHORIZE_URL,
  SOUNDCLOUD_CLIENT_ID,
  SOUNDCLOUD_REDIRECT_URI,
  SOUNDCLOUD_TOKEN_PROXY_URL,
} from './config'
// Circular with soundcloud-api.ts (it imports getValidConnection/refreshAccessToken/
// SoundCloudAuthError from here) — safe because fetchCurrentSoundCloudUser is only
// called at runtime inside establishConnection(), well after both modules finish
// evaluating, not from top-level module code.
import { fetchCurrentSoundCloudUser } from './soundcloud-api'

// Auth state lives here, separate from game data (spec §25). Because this app has
// no backend, "secure server-side token handling" becomes "keep tokens out of
// durable storage": sessionStorage instead of localStorage, cleared when the tab
// closes, never written into the game/localStorage repository.

const PKCE_STORAGE_KEY = 'gts.soundcloud.pkce'
const CONNECTION_STORAGE_KEY = 'gts.soundcloud.connection'

export interface SoundCloudConnection {
  soundcloudUserId: string
  username: string
  avatarUrl?: string
  accessToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

interface PkceState {
  codeVerifier: string
  oauthState: string
  returnTo: string
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
  token_type: string
}

export function getStoredConnection(): SoundCloudConnection | null {
  const raw = sessionStorage.getItem(CONNECTION_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SoundCloudConnection
  } catch {
    return null
  }
}

function storeConnection(connection: SoundCloudConnection) {
  sessionStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(connection))
}

export function isConnected(): boolean {
  return getStoredConnection() !== null
}

export function disconnectSoundCloud() {
  sessionStorage.removeItem(CONNECTION_STORAGE_KEY)
  sessionStorage.removeItem(PKCE_STORAGE_KEY)
}

/** Kicks off the Authorization Code + PKCE redirect. `returnTo` is restored after the callback. */
export async function connectSoundCloud(returnTo: string) {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const oauthState = generateState()

  const pkceState: PkceState = { codeVerifier, oauthState, returnTo }
  sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(pkceState))

  const url = new URL(SOUNDCLOUD_AUTHORIZE_URL)
  url.searchParams.set('client_id', SOUNDCLOUD_CLIENT_ID)
  url.searchParams.set('redirect_uri', SOUNDCLOUD_REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', oauthState)

  window.location.assign(url.toString())
}

export class SoundCloudAuthError extends Error {}

/** Called from the /callback route. Exchanges the code for tokens and fetches the profile. */
export async function handleCallback(searchParams: URLSearchParams): Promise<string> {
  const raw = sessionStorage.getItem(PKCE_STORAGE_KEY)
  if (!raw) throw new SoundCloudAuthError('No SoundCloud connection was in progress.')
  const pkceState = JSON.parse(raw) as PkceState

  const error = searchParams.get('error')
  if (error) throw new SoundCloudAuthError(searchParams.get('error_description') ?? error)

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  if (!code || state !== pkceState.oauthState) {
    throw new SoundCloudAuthError('SoundCloud authorization response was invalid or expired. Please try connecting again.')
  }

  const tokens = await requestToken({
    grant_type: 'authorization_code',
    redirect_uri: SOUNDCLOUD_REDIRECT_URI,
    code_verifier: pkceState.codeVerifier,
    code,
  })
  await establishConnection(tokens)

  sessionStorage.removeItem(PKCE_STORAGE_KEY)
  return pkceState.returnTo
}

// Talks to our token-exchange proxy (worker/src/index.js), not SoundCloud directly —
// SoundCloud's /oauth/token requires client_secret even for PKCE, which a static site
// can't hold. client_id is added by the proxy, not sent from here (see worker source).
async function requestToken(payload: Record<string, string>): Promise<TokenResponse> {
  if (!SOUNDCLOUD_TOKEN_PROXY_URL) {
    throw new SoundCloudAuthError(
      'VITE_SOUNDCLOUD_TOKEN_PROXY_URL is not set. Deploy the Cloudflare Worker in /worker and point this app at it — see README.md "SoundCloud token proxy".',
    )
  }

  const response = await fetch(`${SOUNDCLOUD_TOKEN_PROXY_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new SoundCloudAuthError(
      `SoundCloud token request failed (${response.status}). ${detail || 'Check that VITE_SOUNDCLOUD_REDIRECT_URI matches the app\'s registered redirect URI exactly.'}`,
    )
  }

  return (await response.json()) as TokenResponse
}

async function establishConnection(tokens: TokenResponse) {
  const connection: SoundCloudConnection = {
    soundcloudUserId: '',
    username: '',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  }
  storeConnection(connection)

  const profile = await fetchCurrentSoundCloudUser()
  storeConnection({
    ...connection,
    soundcloudUserId: String(profile.id),
    username: profile.username,
    avatarUrl: profile.avatar_url,
  })
}

// Refresh tokens are single-use (SoundCloud §25) — this in-flight promise makes
// concurrent 401s from parallel requests share one refresh instead of racing
// two token requests, which would invalidate each other.
let refreshInFlight: Promise<SoundCloudConnection> | null = null

export async function refreshAccessToken(): Promise<SoundCloudConnection> {
  if (refreshInFlight) return refreshInFlight

  const connection = getStoredConnection()
  if (!connection) throw new SoundCloudAuthError('Not connected to SoundCloud.')

  refreshInFlight = (async () => {
    try {
      const tokens = await requestToken({
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
      })
      const next: SoundCloudConnection = {
        ...connection,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      }
      storeConnection(next)
      return next
    } catch (err) {
      disconnectSoundCloud()
      throw err
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

/** Returns a connection with a non-expired access token, refreshing first if needed. */
export async function getValidConnection(): Promise<SoundCloudConnection> {
  const connection = getStoredConnection()
  if (!connection) throw new SoundCloudAuthError('Not connected to SoundCloud.')

  const expiresInMs = connection.expiresAt - Date.now()
  if (expiresInMs < 60_000) {
    return refreshAccessToken()
  }
  return connection
}
