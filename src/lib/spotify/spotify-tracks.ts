import { spotifyFetchJson, SpotifyApiError } from './spotify-api'
import { getValidConnection } from './spotify-auth'

// Raw shape is intentionally partial — only the fields this app reads.
interface RawSpotifyTrack {
  id: string
  uri: string
  name: string
  artists: Array<{ name: string }>
  album?: { images?: Array<{ url: string; width: number; height: number }> }
  duration_ms: number
  external_urls?: { spotify?: string }
}

interface RawSpotifyArtist {
  id: string
  name: string
  images?: Array<{ url: string; width: number; height: number }>
}

interface SearchResponse {
  tracks?: { items: RawSpotifyTrack[]; total?: number }
  artists?: { items: RawSpotifyArtist[] }
}

export interface ImportableSpotifyTrack {
  spotifyTrackId: string
  spotifyUri: string
  spotifyUrl?: string
  title: string
  artist: string
  artworkUrl?: string
  duration: number // seconds
}

export interface SpotifyArtistMatch {
  id: string
  name: string
  imageUrl?: string
}

export interface SpotifySearchResult {
  tracks: ImportableSpotifyTrack[]
  artist: SpotifyArtistMatch | null
}

function mapToImportableSpotifyTrack(raw: RawSpotifyTrack): ImportableSpotifyTrack {
  // Images are listed largest-first; a mid-size one is plenty for a card/artwork thumbnail
  // and lighter to load than the largest (usually 640x640).
  const images = raw.album?.images ?? []
  const artworkUrl = images[Math.min(1, images.length - 1)]?.url ?? images[0]?.url

  return {
    spotifyTrackId: raw.id,
    spotifyUri: raw.uri,
    spotifyUrl: raw.external_urls?.spotify,
    title: raw.name,
    artist: raw.artists.map((a) => a.name).join(', '),
    artworkUrl,
    duration: Math.round(raw.duration_ms / 1000),
  }
}

function mapToArtistMatch(raw: RawSpotifyArtist): SpotifyArtistMatch {
  const images = raw.images ?? []
  return { id: raw.id, name: raw.name, imageUrl: images[Math.min(1, images.length - 1)]?.url ?? images[0]?.url }
}

const RESULT_TARGET = 20
// Confirmed via testing: this app's Spotify search rejects explicit `limit` values of both
// 24 and 20 (Spotify's own documented default) with a bare "Invalid limit" 400, and omitting
// the param falls back to only 5 results — so whatever per-request cap is enforced here is
// well under the documented 1-50 range. Probe from high to low once, then page with
// `offset` at whichever value actually works to still surface a reasonable result count.
const CANDIDATE_LIMITS = [50, 25, 10, 5, 1]
let workingLimit: number | null = null

function isInvalidLimitError(err: unknown): boolean {
  return err instanceof SpotifyApiError && /invalid limit/i.test(err.message)
}

async function fetchSearchPage(query: string, types: string, limit: number, offset: number): Promise<SearchResponse> {
  return spotifyFetchJson<SearchResponse>(
    `/search?type=${types}&limit=${limit}&offset=${offset}&q=${encodeURIComponent(query)}`,
  )
}

// Only the first page also asks for `type=artist` — pagination past it only ever needs
// more tracks, and re-requesting artist matches on every page would be wasted work.
async function fetchFirstPage(query: string): Promise<SearchResponse> {
  if (workingLimit !== null) {
    try {
      return await fetchSearchPage(query, 'artist,track', workingLimit, 0)
    } catch (err) {
      if (!isInvalidLimitError(err)) throw err
      workingLimit = null // cap may have changed (e.g. quota mode approved) — re-probe below
    }
  }

  let lastErr: unknown
  for (const limit of CANDIDATE_LIMITS) {
    try {
      const page = await fetchSearchPage(query, 'artist,track', limit, 0)
      workingLimit = limit
      return page
    } catch (err) {
      if (!isInvalidLimitError(err)) throw err
      lastErr = err
    }
  }
  throw lastErr
}

export async function searchSpotifyTracks(query: string): Promise<SpotifySearchResult> {
  if (!query.trim()) return { tracks: [], artist: null }

  const first = await fetchFirstPage(query)
  const items = [...(first.tracks?.items ?? [])]
  const limit = workingLimit ?? items.length
  const total = first.tracks?.total ?? items.length

  while (limit > 0 && items.length < RESULT_TARGET && items.length < total) {
    const page = await fetchSearchPage(query, 'track', limit, items.length)
    const pageItems = page.tracks?.items ?? []
    if (pageItems.length === 0) break
    items.push(...pageItems)
  }

  const topArtist = first.artists?.items?.[0]
  return { tracks: items.map(mapToImportableSpotifyTrack), artist: topArtist ? mapToArtistMatch(topArtist) : null }
}

/** Fetches an artist's top tracks — used once the host picks the artist chip above search results. */
export async function getArtistTopTracks(artistId: string): Promise<ImportableSpotifyTrack[]> {
  const connection = await getValidConnection()
  const market = connection.country || 'US'
  const data = await spotifyFetchJson<{ tracks: RawSpotifyTrack[] }>(`/artists/${artistId}/top-tracks?market=${market}`)
  return (data.tracks ?? []).map(mapToImportableSpotifyTrack)
}
