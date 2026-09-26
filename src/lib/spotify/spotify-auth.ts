import { generateCodeChallenge, generateCodeVerifier, generateState } from '../pkce'
import { SPOTIFY_AUTHORIZE_URL, SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPES, SPOTIFY_TOKEN_URL } from './config'

// Same pattern as soundcloud-auth.ts: tokens live in sessionStorage only, never in the
// game/localStorage repository, cleared when the tab closes.

const PKCE_STORAGE_KEY = 'gts.spotify.pkce'
const CONNECTION_STORAGE_KEY = 'gts.spotify.connection'
const STATE_PREFIX = 'sp'

export interface SpotifyConnection {
  spotifyUserId: string
  displayName: string
  country: string
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
  refresh_token?: string
  expires_in: number
  scope?: string
  token_type: string
}

export function getStoredConnection(): SpotifyConnection | null {
  const raw = sessionStorage.getItem(CONNECTION_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SpotifyConnection
  } catch {
    return null
  }
}

function storeConnection(connection: SpotifyConnection) {
  sessionStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(connection))
}

export function isConnected(): boolean {
  return getStoredConnection() !== null
}

export function disconnectSpotify() {
  sessionStorage.removeItem(CONNECTION_STORAGE_KEY)
  sessionStorage.removeItem(PKCE_STORAGE_KEY)
}

export function isSpotifyState(state: string | null): boolean {
  return !!state && state.startsWith(`${STATE_PREFIX}.`)
}

/** Kicks off the Authorization Code + PKCE redirect. `returnTo` is restored after the callback. */
export async function connectSpotify(returnTo: string) {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const oauthState = generateState(STATE_PREFIX)

  const pkceState: PkceState = { codeVerifier, oauthState, returnTo }
  sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(pkceState))

  const url = new URL(SPOTIFY_AUTHORIZE_URL)
  url.searchParams.set('client_id', SPOTIFY_CLIENT_ID)
  url.searchParams.set('redirect_uri', SPOTIFY_REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', oauthState)
  url.searchParams.set('scope', SPOTIFY_SCOPES)

  window.location.assign(url.toString())
}

export class SpotifyAuthError extends Error {}

/** Called from the /callback route once it's identified this as a Spotify redirect. */
export async function handleCallback(searchParams: URLSearchParams): Promise<string> {
  const raw = sessionStorage.getItem(PKCE_STORAGE_KEY)
  if (!raw) throw new SpotifyAuthError('No Spotify connection was in progress.')
  const pkceState = JSON.parse(raw) as PkceState

  const error = searchParams.get('error')
  if (error) throw new SpotifyAuthError(error)

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  if (!code || state !== pkceState.oauthState) {
    throw new SpotifyAuthError('Spotify authorization response was invalid or expired. Please try connecting again.')
  }

  const tokens = await requestToken({
    grant_type: 'authorization_code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_verifier: pkceState.codeVerifier,
    code,
    client_id: SPOTIFY_CLIENT_ID,
  })
  await establishConnection(tokens)

  sessionStorage.removeItem(PKCE_STORAGE_KEY)
  return pkceState.returnTo
}

// Spotify's /api/token wants a form-encoded body (not JSON), and — because this is the
// Authorization Code *with PKCE* flow for a public client — accepts it with no client
// secret at all, straight from the browser. No Worker proxy needed, unlike SoundCloud.
async function requestToken(payload: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams(payload)
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new SpotifyAuthError(
      `Spotify token request failed (${response.status}). ${detail || "Check that VITE_SPOTIFY_REDIRECT_URI matches the app's registered redirect URI exactly."}`,
    )
  }

  return (await response.json()) as TokenResponse
}

async function establishConnection(tokens: TokenResponse) {
  if (!tokens.refresh_token) {
    throw new SpotifyAuthError('Spotify did not return a refresh token — check the requested scopes.')
  }
  const connection: SpotifyConnection = {
    spotifyUserId: '',
    displayName: '',
    country: '',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  }
  storeConnection(connection)

  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (response.ok) {
      // `country` is needed as the `market` param on endpoints like artist top-tracks —
      // Spotify deprecated the old `market=from_token` shortcut, so this is the only way
      // left to infer it without asking the host to pick a country manually.
      const profile = (await response.json()) as { id: string; display_name?: string; country?: string }
      storeConnection({
        ...connection,
        spotifyUserId: profile.id,
        displayName: profile.display_name ?? profile.id,
        country: profile.country ?? '',
      })
    }
  } catch {
    // Profile fetch is best-effort cosmetic info (display name/country) — the connection
    // itself already succeeded and shouldn't be thrown away over this.
  }
}

// Refresh tokens can be reused, but concurrent 401s from parallel requests would otherwise
// race two token requests — share one refresh instead, same pattern as SoundCloud.
let refreshInFlight: Promise<SpotifyConnection> | null = null

export async function refreshAccessToken(): Promise<SpotifyConnection> {
  if (refreshInFlight) return refreshInFlight

  const connection = getStoredConnection()
  if (!connection) throw new SpotifyAuthError('Not connected to Spotify.')

  refreshInFlight = (async () => {
    try {
      const tokens = await requestToken({
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
        client_id: SPOTIFY_CLIENT_ID,
      })
      const next: SpotifyConnection = {
        ...connection,
        accessToken: tokens.access_token,
        // Spotify's refresh response doesn't always include a new refresh_token — keep the
        // existing one when it doesn't.
        refreshToken: tokens.refresh_token ?? connection.refreshToken,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      }
      storeConnection(next)
      return next
    } catch (err) {
      disconnectSpotify()
      throw err
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

/** Returns a connection with a non-expired access token, refreshing first if needed. */
export async function getValidConnection(): Promise<SpotifyConnection> {
  const connection = getStoredConnection()
  if (!connection) throw new SpotifyAuthError('Not connected to Spotify.')

  const expiresInMs = connection.expiresAt - Date.now()
  if (expiresInMs < 60_000) {
    return refreshAccessToken()
  }
  return connection
}
