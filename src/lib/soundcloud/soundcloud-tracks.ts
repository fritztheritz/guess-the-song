import { scFetchJson } from './soundcloud-api'
import type { SoundCloudAccess } from '../../types'

// Raw shapes are intentionally partial — we only declare the fields this app reads.
// Matches the registered-developer API's track resource (developers.soundcloud.com/docs/api/guide),
// not the unrelated internal shape (media.transcodings) the soundcloud.com web player's
// unofficial API uses — those are two different APIs with different response shapes.
export interface RawSoundCloudTrack {
  id: number
  urn?: string
  title: string
  user?: { username: string }
  artwork_url?: string | null
  duration: number // ms
  sharing: 'public' | 'private'
  streamable: boolean
  /** Direct classification from the API — prefer this over deriving it. */
  access?: 'playable' | 'preview' | 'blocked'
  /** Required as a query param to fetch/stream a private track you don't own (e.g. a shared link). */
  secret_token?: string
  permalink_url?: string
}

export interface RawSoundCloudPlaylist {
  id: number
  title: string
  artwork_url?: string | null
  track_count: number
  tracks?: RawSoundCloudTrack[]
}

export interface ImportableTrack {
  soundcloudTrackId: string
  soundcloudUrn?: string
  soundcloudUrl?: string
  soundcloudSecretToken?: string
  title: string
  artist: string
  artworkUrl?: string
  duration: number // seconds
  isPrivate: boolean
  access: SoundCloudAccess
}

export function mapToImportableTrack(raw: RawSoundCloudTrack): ImportableTrack {
  const access: SoundCloudAccess = raw.access ?? (raw.streamable ? 'playable' : 'blocked')

  return {
    soundcloudTrackId: String(raw.id),
    soundcloudUrn: raw.urn,
    soundcloudUrl: raw.permalink_url,
    soundcloudSecretToken: raw.secret_token,
    title: raw.title,
    artist: raw.user?.username ?? 'Unknown artist',
    artworkUrl: raw.artwork_url?.replace('-large', '-t500x500') ?? undefined,
    duration: Math.round(raw.duration / 1000),
    isPrivate: raw.sharing === 'private',
    access,
  }
}

const PAGE_SIZE = 50

// List endpoints wrap results as { collection: [...], next_href } rather than a bare
// array (confirmed against a real response — a prior version of this code assumed a bare
// array and broke every list tab with "X.map is not a function"). This app only shows the
// first page (next_href/pagination isn't implemented), which is plenty for a game night.
interface CollectionResponse<T> {
  collection: T[]
  next_href?: string
}

function unwrapCollection<T>(response: T[] | CollectionResponse<T>): T[] {
  return Array.isArray(response) ? response : response.collection
}

export async function getMyTracks(): Promise<ImportableTrack[]> {
  const response = await scFetchJson<RawSoundCloudTrack[] | CollectionResponse<RawSoundCloudTrack>>(
    `/me/tracks?linked_partitioning=true&limit=${PAGE_SIZE}`,
  )
  return unwrapCollection(response).map(mapToImportableTrack)
}

export async function getLikedTracks(): Promise<ImportableTrack[]> {
  const response = await scFetchJson<RawSoundCloudTrack[] | CollectionResponse<RawSoundCloudTrack>>(
    `/me/likes/tracks?linked_partitioning=true&limit=${PAGE_SIZE}`,
  )
  return unwrapCollection(response).map(mapToImportableTrack)
}

export async function getPlaylists(): Promise<Array<{ id: string; title: string; artworkUrl?: string; trackCount: number }>> {
  const response = await scFetchJson<RawSoundCloudPlaylist[] | CollectionResponse<RawSoundCloudPlaylist>>(
    `/me/playlists?linked_partitioning=true&limit=${PAGE_SIZE}`,
  )
  return unwrapCollection(response).map((p) => ({
    id: String(p.id),
    title: p.title,
    artworkUrl: p.artwork_url ?? undefined,
    trackCount: p.track_count,
  }))
}

export async function getPlaylistTracks(playlistId: string): Promise<ImportableTrack[]> {
  const playlist = await scFetchJson<RawSoundCloudPlaylist>(`/playlists/${playlistId}?representation=full`)
  return (playlist.tracks ?? []).map(mapToImportableTrack)
}

export async function searchTracks(query: string): Promise<ImportableTrack[]> {
  if (!query.trim()) return []
  const response = await scFetchJson<RawSoundCloudTrack[] | CollectionResponse<RawSoundCloudTrack>>(
    `/tracks?q=${encodeURIComponent(query)}&linked_partitioning=true&limit=${PAGE_SIZE}`,
  )
  return unwrapCollection(response).map(mapToImportableTrack)
}

export async function getTrack(trackId: string): Promise<ImportableTrack> {
  const track = await scFetchJson<RawSoundCloudTrack>(`/tracks/${trackId}`)
  return mapToImportableTrack(track)
}

/** Resolves any soundcloud.com URL (track, private share link, etc.) to its API resource. */
export async function resolveSoundCloudUrl(url: string): Promise<ImportableTrack> {
  const track = await scFetchJson<RawSoundCloudTrack>(`/resolve?url=${encodeURIComponent(url)}`)
  return mapToImportableTrack(track)
}
