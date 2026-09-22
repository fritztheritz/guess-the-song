import { scFetchJson, SoundCloudApiError } from './soundcloud-api'

export class TrackNotPlayableError extends SoundCloudApiError {}

// GET /tracks/:id/streams returns a set of stream-resolution endpoints (still on
// api.soundcloud.com, still requiring our Bearer token) — NOT final playable URLs. Each
// one has to be GET'd again (authenticated) to get back { url: <actual signed CDN link> }.
// Which fields are present varies per track: some have a full progressive http_mp3_128_url,
// others only offer HLS for full playback plus a short preview_mp3_128_url snippet — since
// this app only ever plays 2-10s clips, a preview-only track is still perfectly playable.
interface StreamsResponse {
  http_mp3_128_url?: string
  hls_mp3_128_url?: string
  hls_aac_160_url?: string
  hls_opus_64_url?: string
  preview_mp3_128_url?: string
  preview_hls_mp3_128_url?: string
}

interface ResolvedStream {
  url: string
}

// Signed stream URLs expire; caching briefly avoids re-resolving on every clue
// replay within the same possession, which matters against SoundCloud's
// documented 15k-requests/24h-per-client-id stream limit (spec §27).
const streamCache = new Map<string, { url: string; cachedAt: number }>()
const CACHE_TTL_MS = 4 * 60 * 1000

/** Resolves the authorized, playable stream URL for a track. Throws TrackNotPlayableError if blocked. */
export async function getTrackPlayback(trackId: string, secretToken?: string): Promise<string> {
  const cached = streamCache.get(trackId)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.url
  }

  const query = secretToken ? `?secret_token=${encodeURIComponent(secretToken)}` : ''

  let streams: StreamsResponse
  try {
    streams = await scFetchJson<StreamsResponse>(`/tracks/${trackId}/streams${query}`)
  } catch (err) {
    if (err instanceof SoundCloudApiError && (err.status === 403 || err.status === 404)) {
      throw new TrackNotPlayableError(
        'This track can be imported as metadata, but SoundCloud does not currently allow playback.',
      )
    }
    throw err
  }

  // Prefer a full progressive stream; fall back to the preview snippet — plenty for a
  // 2-10s clue. HLS-only tracks (no progressive/preview url at all) aren't supported yet.
  const resolutionUrl = streams.http_mp3_128_url ?? streams.preview_mp3_128_url
  if (resolutionUrl) {
    const resolved = await scFetchJson<ResolvedStream>(resolutionUrl)
    streamCache.set(trackId, { url: resolved.url, cachedAt: Date.now() })
    return resolved.url
  }

  if (streams.hls_mp3_128_url || streams.hls_aac_160_url || streams.hls_opus_64_url || streams.preview_hls_mp3_128_url) {
    throw new TrackNotPlayableError(
      'This track is only available as HLS streaming, which this app doesn\'t support yet — try a different track.',
    )
  }

  // Surfaces the actual response shape rather than failing silently — if SoundCloud's field
  // names differ from what's expected above, this makes the mismatch immediately diagnosable.
  const keys = Object.keys(streams)
  throw new TrackNotPlayableError(
    keys.length > 0
      ? `SoundCloud returned an unrecognized stream response (fields: ${keys.join(', ')}). This app's code needs updating to match.`
      : 'This private track isn\'t available through the current SoundCloud authorization.',
  )
}

export function clearPlaybackCache() {
  streamCache.clear()
}
