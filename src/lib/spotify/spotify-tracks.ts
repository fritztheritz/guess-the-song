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

interface RawSpotifyPlaylist {
  id: string
  name: string
  images?: Array<{ url: string }> | null
  tracks?: { total?: number }
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
  total: number
}

export interface SpotifyPlaylistSummary {
  id: string
  name: string
  imageUrl?: string
  trackCount: number
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

function mapToPlaylistSummary(raw: RawSpotifyPlaylist): SpotifyPlaylistSummary {
  const images = raw.images ?? []
  return {
    id: raw.id,
    name: raw.name,
    imageUrl: images[Math.min(1, images.length - 1)]?.url ?? images[0]?.url,
    trackCount: raw.tracks?.total ?? 0,
  }
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

// The "Invalid limit" cap turned out not to be specific to /search — it's this app's
// per-request quota, enforced the same way across endpoints. Shared by every paginated
// fetch below so the probe (and its result) only ever has to happen once per session.
async function withLimitFallback<T>(request: (limit: number) => Promise<T>): Promise<{ page: T; limit: number }> {
  if (workingLimit !== null) {
    try {
      return { page: await request(workingLimit), limit: workingLimit }
    } catch (err) {
      if (!isInvalidLimitError(err)) throw err
      workingLimit = null // cap may have changed (e.g. quota mode approved) — re-probe below
    }
  }

  let lastErr: unknown
  for (const limit of CANDIDATE_LIMITS) {
    try {
      const page = await request(limit)
      workingLimit = limit
      return { page, limit }
    } catch (err) {
      if (!isInvalidLimitError(err)) throw err
      lastErr = err
    }
  }
  throw lastErr
}

async function fetchSearchPage(query: string, types: string, limit: number, offset: number): Promise<SearchResponse> {
  return spotifyFetchJson<SearchResponse>(
    `/search?type=${types}&limit=${limit}&offset=${offset}&q=${encodeURIComponent(query)}`,
  )
}

// Only the first page also asks for `type=artist` — pagination past it only ever needs
// more tracks, and re-requesting artist matches on every page would be wasted work.
async function fetchFirstPage(query: string): Promise<SearchResponse> {
  const { page } = await withLimitFallback((limit) => fetchSearchPage(query, 'artist,track', limit, 0))
  return page
}

export async function searchSpotifyTracks(query: string): Promise<SpotifySearchResult> {
  if (!query.trim()) return { tracks: [], artist: null, total: 0 }

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
  return { tracks: items.map(mapToImportableSpotifyTrack), artist: topArtist ? mapToArtistMatch(topArtist) : null, total }
}

/**
 * Fetches the next batch of tracks after `offset` already-loaded ones, for a "Load more"
 * control — `searchSpotifyTracks` only ever hands back the first `RESULT_TARGET` (~20).
 * Reuses whatever per-request `limit` the initial search already found working; if none is
 * cached yet (e.g. called before any search this session), falls back to the smallest
 * candidate, since that's the one this app's search has been most reliably accepting.
 */
export async function loadMoreSpotifyTracks(query: string, offset: number): Promise<ImportableSpotifyTrack[]> {
  const limit = workingLimit ?? CANDIDATE_LIMITS[CANDIDATE_LIMITS.length - 1]
  const items: RawSpotifyTrack[] = []
  while (items.length < RESULT_TARGET) {
    const page = await fetchSearchPage(query, 'track', limit, offset + items.length)
    const pageItems = page.tracks?.items ?? []
    if (pageItems.length === 0) break
    items.push(...pageItems)
  }
  return items.map(mapToImportableSpotifyTrack)
}

/** Fetches an artist's top tracks — used once the host picks the artist chip above search results. */
export async function getArtistTopTracks(artistId: string): Promise<ImportableSpotifyTrack[]> {
  const connection = await getValidConnection()
  const market = connection.country || 'US'
  const data = await spotifyFetchJson<{ tracks: RawSpotifyTrack[] }>(`/artists/${artistId}/top-tracks?market=${market}`)
  return (data.tracks ?? []).map(mapToImportableSpotifyTrack)
}

const PLAYLIST_TARGET = 50 // most hosts won't have more than this many of their own playlists

/** Lists the connected account's own playlists, for the import modal's "Playlists" tab. */
export async function getMyPlaylists(): Promise<SpotifyPlaylistSummary[]> {
  type PlaylistsResponse = { items: RawSpotifyPlaylist[]; total?: number }
  const fetchPage = (limit: number, offset: number) =>
    spotifyFetchJson<PlaylistsResponse>(`/me/playlists?limit=${limit}&offset=${offset}`)

  const { page: first, limit } = await withLimitFallback((limit) => fetchPage(limit, 0))
  const items = [...first.items]
  const total = first.total ?? items.length

  while (limit > 0 && items.length < PLAYLIST_TARGET && items.length < total) {
    const page = await fetchPage(limit, items.length)
    if (page.items.length === 0) break
    items.push(...page.items)
  }

  return items.filter((p) => p !== null).map(mapToPlaylistSummary)
}

export interface SpotifyPlaylistTracksPage {
  tracks: ImportableSpotifyTrack[]
  total: number
}

/**
 * Fetches ONE page of a playlist's tracks at `offset`, at whatever per-request `limit` this
 * app's quota allows — deliberately not auto-paginated to completion here, unlike
 * getMyPlaylists/searchSpotifyTracks. A playlist can run into the hundreds of tracks, and at
 * this app's ~5-per-request cap that's a lot of round trips; the caller decides the loading
 * policy (see ImportSpotifyModal's openPlaylist).
 */
export async function getPlaylistTracksPage(playlistId: string, offset: number): Promise<SpotifyPlaylistTracksPage> {
  type PlaylistTracksResponse = { items: Array<{ track: RawSpotifyTrack | null }>; total?: number }
  const fetchPage = (limit: number) =>
    spotifyFetchJson<PlaylistTracksResponse>(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`)

  const { page } = await withLimitFallback(fetchPage)
  const tracks = page.items
    .map((i) => i.track)
    .filter((t): t is RawSpotifyTrack => t !== null)
    .map(mapToImportableSpotifyTrack)
  return { tracks, total: page.total ?? tracks.length }
}
