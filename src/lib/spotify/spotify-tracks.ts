import { spotifyFetchJson } from './spotify-api'

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

interface SearchResponse {
  tracks?: { items: RawSpotifyTrack[] }
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

export async function searchSpotifyTracks(query: string): Promise<ImportableSpotifyTrack[]> {
  if (!query.trim()) return []
  // No explicit `limit` — this app's Spotify search has been rejecting it with a bare
  // "Invalid limit" 400 at both 24 and 20 (Spotify's own documented default), so whatever
  // cap is being enforced here isn't the standard 1-50 range. Omitting it lets Spotify
  // apply its own default rather than guessing at another number.
  const data = await spotifyFetchJson<SearchResponse>(`/search?type=track&q=${encodeURIComponent(query)}`)
  return (data.tracks?.items ?? []).map(mapToImportableSpotifyTrack)
}
