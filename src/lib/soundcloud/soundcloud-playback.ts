import { scFetch, scFetchJson, SoundCloudApiError } from './soundcloud-api'
import type { RawSoundCloudTrack } from './soundcloud-tracks'

export class TrackNotPlayableError extends SoundCloudApiError {}

interface StreamResolution {
  url: string
}

// Signed stream URLs expire; caching briefly avoids re-resolving on every clue
// replay within the same possession, which matters against SoundCloud's
// documented 15k-requests/24h-per-client-id stream limit (spec §27).
const streamCache = new Map<string, { url: string; cachedAt: number }>()
const CACHE_TTL_MS = 4 * 60 * 1000

/** Resolves the authorized, playable stream URL for a track. Throws TrackNotPlayableError if blocked. */
export async function getTrackPlayback(trackId: string): Promise<string> {
  const cached = streamCache.get(trackId)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.url
  }

  const track = await scFetchJson<RawSoundCloudTrack>(`/tracks/${trackId}`)

  if (!track.streamable || track.policy === 'BLOCK') {
    throw new TrackNotPlayableError(
      'This track can be imported as metadata, but SoundCloud does not currently allow playback.',
    )
  }

  const transcodings = track.media?.transcodings ?? []
  const progressive = transcodings.find((t) => t.format.protocol === 'progressive') ?? transcodings[0]
  if (!progressive) {
    throw new TrackNotPlayableError(
      'This private track isn\'t available through the current SoundCloud authorization.',
    )
  }

  const resolution = await scFetch(progressive.url).then((r) => r.json() as Promise<StreamResolution>)
  streamCache.set(trackId, { url: resolution.url, cachedAt: Date.now() })
  return resolution.url
}

export function clearPlaybackCache() {
  streamCache.clear()
}
