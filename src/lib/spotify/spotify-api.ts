import { SPOTIFY_API_BASE } from './config'
import { getValidConnection, refreshAccessToken, SpotifyAuthError } from './spotify-auth'

export class SpotifyApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

export class SpotifyRateLimitError extends SpotifyApiError {}
export class SpotifyNotConnectedError extends SpotifyApiError {}
export class SpotifyPremiumRequiredError extends SpotifyApiError {}

/** Authenticated fetch against the Spotify Web API. Retries once after a token refresh on 401. */
export async function spotifyFetch(path: string, init: RequestInit = {}, isRetry = false): Promise<Response> {
  let connection
  try {
    connection = await getValidConnection()
  } catch (err) {
    if (err instanceof SpotifyAuthError) throw new SpotifyNotConnectedError(err.message)
    throw err
  }

  const url = path.startsWith('http') ? path : `${SPOTIFY_API_BASE}${path}`
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${connection.accessToken}` },
  })

  if (response.status === 401 && !isRetry) {
    await refreshAccessToken()
    return spotifyFetch(path, init, true)
  }

  if (response.status === 429) {
    throw new SpotifyRateLimitError('Spotify is temporarily limiting requests. Please try again shortly.', 429)
  }

  if (response.status === 403) {
    throw new SpotifyPremiumRequiredError('This requires a Spotify Premium account connected as the host.', 403)
  }

  if (!response.ok) {
    const detail = await response
      .clone()
      .json()
      .then((body: { error?: { message?: string } }) => body?.error?.message)
      .catch(() => undefined)
    throw new SpotifyApiError(`Spotify request failed (${response.status})${detail ? `: ${detail}` : '.'}`, response.status)
  }

  return response
}

export async function spotifyFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await spotifyFetch(path, init)
  return (await response.json()) as T
}
