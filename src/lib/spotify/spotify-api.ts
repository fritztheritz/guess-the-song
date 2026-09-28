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
/** 403 on an otherwise-valid, correctly-scoped request — in practice almost always one of
 *  two Development Mode causes (see the 403 branch below), never something the request
 *  itself did wrong, so callers shouldn't need to guess from a bare status code. */
export class SpotifyAccessRestrictedError extends SpotifyApiError {}

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

  if (!response.ok) {
    const rawBody = await response.text().catch(() => '')
    let detail: string | undefined
    try {
      const parsed = JSON.parse(rawBody) as { error?: { message?: string } | string; error_description?: string }
      detail =
        (typeof parsed.error === 'object' ? parsed.error?.message : undefined) ??
        parsed.error_description ??
        (typeof parsed.error === 'string' ? parsed.error : undefined)
    } catch {
      detail = rawBody || undefined
    }
    // eslint-disable-next-line no-console -- surfaced in-app too, but the full raw body (headers, url) is only useful here
    console.error('Spotify API error', { url, status: response.status, body: rawBody })

    // A 403 here (as opposed to 401 "bad/expired token", already handled above) means the
    // token is valid but Spotify won't serve this app/user combination — in this app's PKCE
    // setup that's essentially always one of two Development Mode causes, not a token or
    // request-shape problem, so say so instead of just surfacing the raw status code.
    if (response.status === 403) {
      throw new SpotifyAccessRestrictedError(
        `Spotify blocked this request (403)${detail ? `: ${detail}` : ''}. Almost always Development Mode: either this Spotify account isn't added as a tester yet (Spotify Developer Dashboard → your app → Users and Access → add its email), or Spotify's Nov 2024 policy change restricted this particular endpoint for apps without Extended Quota Mode approval — try a different account first, then check the dashboard if every account 403s the same way.`,
        403,
      )
    }

    throw new SpotifyApiError(`Spotify request failed (${response.status})${detail ? `: ${detail}` : '.'}`, response.status)
  }

  return response
}

export async function spotifyFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await spotifyFetch(path, init)
  return (await response.json()) as T
}
