import { SOUNDCLOUD_API_BASE } from './config'
import { getValidConnection, refreshAccessToken, SoundCloudAuthError } from './soundcloud-auth'

export class SoundCloudApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

export class SoundCloudRateLimitError extends SoundCloudApiError {}
export class SoundCloudNotConnectedError extends SoundCloudApiError {}

export interface SoundCloudUser {
  id: number
  username: string
  avatar_url?: string
  permalink_url?: string
}

/** Authenticated fetch against the SoundCloud API. Retries once after a token refresh on 401. */
export async function scFetch(path: string, init: RequestInit = {}, isRetry = false): Promise<Response> {
  let connection
  try {
    connection = await getValidConnection()
  } catch (err) {
    if (err instanceof SoundCloudAuthError) throw new SoundCloudNotConnectedError(err.message)
    throw err
  }

  const url = path.startsWith('http') ? path : `${SOUNDCLOUD_API_BASE}${path}`
  const response = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${connection.accessToken}`,
      Accept: 'application/json; charset=utf-8',
    },
  })

  if (response.status === 401 && !isRetry) {
    await refreshAccessToken()
    return scFetch(path, init, true)
  }

  if (response.status === 429) {
    throw new SoundCloudRateLimitError(
      'SoundCloud is temporarily limiting playback requests. Please try again shortly.',
      429,
    )
  }

  if (!response.ok) {
    throw new SoundCloudApiError(`SoundCloud request failed (${response.status}).`, response.status)
  }

  return response
}

export async function scFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await scFetch(path, init)
  return (await response.json()) as T
}

export async function fetchCurrentSoundCloudUser(): Promise<SoundCloudUser> {
  return scFetchJson<SoundCloudUser>('/me')
}
