import { scFetch, scFetchJson, SoundCloudApiError } from './soundcloud-api'
import type { SoundCloudAccess } from '../../types'

export class TrackNotPlayableError extends SoundCloudApiError {}

// GET /tracks/:id/streams returns a set of stream-resolution endpoints (still on
// api.soundcloud.com, still requiring our Bearer token) — NOT final playable URLs, and
// NOT a JSON wrapper either: GET'ing one of these authenticated returns the actual audio
// bytes directly. A native <audio> element can't attach our Authorization header, so we
// fetch the bytes ourselves and hand the browser a blob: URL instead, which needs no auth.
// Which fields are present varies per track: some have a full progressive http_mp3_128_url,
// others only offer HLS for full playback plus a short preview_mp3_128_url snippet — since
// this app only ever plays 2-10s clues, a preview-only track is still perfectly playable.
interface StreamsResponse {
  http_mp3_128_url?: string
  hls_mp3_128_url?: string
  hls_aac_160_url?: string
  hls_opus_64_url?: string
  preview_mp3_128_url?: string
  preview_hls_mp3_128_url?: string
}

// blob: URLs don't expire like signed CDN links do, but they do hold memory — cached only
// long enough to cover clue replays within a possession, and the previous one for a track
// is revoked before a fresh blob replaces it.
const streamCache = new Map<string, { url: string; cachedAt: number }>()
const CACHE_TTL_MS = 4 * 60 * 1000

async function fetchStreams(trackId: string, secretToken?: string): Promise<StreamsResponse> {
  const query = secretToken ? `?secret_token=${encodeURIComponent(secretToken)}` : ''
  try {
    return await scFetchJson<StreamsResponse>(`/tracks/${trackId}/streams${query}`)
  } catch (err) {
    if (err instanceof SoundCloudApiError && (err.status === 403 || err.status === 404)) {
      throw new TrackNotPlayableError(
        'This track can be imported as metadata, but SoundCloud does not currently allow playback.',
      )
    }
    throw err
  }
}

// The track resource's own `access` field (imported alongside title/artist) reflects
// general listenability on SoundCloud, not whether OUR app's API credentials get handed a
// full progressive stream or just a ~30s preview — private/secret-token tracks in
// particular often report 'playable' there while /streams only ever offers the preview
// field. This is the only way to know for sure which one a track will actually get.
export async function checkStreamAccess(trackId: string, secretToken?: string): Promise<SoundCloudAccess> {
  try {
    const streams = await fetchStreams(trackId, secretToken)
    if (streams.http_mp3_128_url) return 'playable'
    if (streams.preview_mp3_128_url) return 'preview'
    return 'blocked'
  } catch {
    return 'blocked'
  }
}

/** Resolves the authorized, playable stream URL for a track. Throws TrackNotPlayableError if blocked. */
export async function getTrackPlayback(trackId: string, secretToken?: string): Promise<string> {
  const cached = streamCache.get(trackId)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.url
  }

  const streams = await fetchStreams(trackId, secretToken)

  // Prefer a full progressive stream; fall back to the preview snippet — plenty for a
  // 2-10s clue. HLS-only tracks (no progressive/preview url at all) aren't supported yet.
  const resolutionUrl = streams.http_mp3_128_url ?? streams.preview_mp3_128_url
  if (resolutionUrl) {
    const response = await scFetch(resolutionUrl)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)

    const previous = streamCache.get(trackId)
    if (previous) URL.revokeObjectURL(previous.url)
    streamCache.set(trackId, { url: objectUrl, cachedAt: Date.now() })
    return objectUrl
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
  for (const { url } of streamCache.values()) URL.revokeObjectURL(url)
  streamCache.clear()
}
