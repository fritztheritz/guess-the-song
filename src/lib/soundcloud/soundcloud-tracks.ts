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

export interface RawSoundCloudUser {
  id: number
  username: string
  avatar_url?: string | null
  permalink_url?: string
}

export interface ImportableArtist {
  id: string
  username: string
  avatarUrl?: string
  profileUrl?: string
}

function mapToImportableArtist(raw: RawSoundCloudUser): ImportableArtist {
  return {
    id: String(raw.id),
    username: raw.username,
    avatarUrl: raw.avatar_url ?? undefined,
    profileUrl: raw.permalink_url,
  }
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
// array and broke every list tab with "X.map is not a function"). next_href is a
// ready-to-use continuation URL (includes its own query params) for the next page.
interface CollectionResponse<T> {
  collection: T[]
  next_href?: string
}

export interface TrackPage {
  tracks: ImportableTrack[]
  nextHref?: string
}

async function fetchTrackPage(path: string): Promise<TrackPage> {
  const response = await scFetchJson<RawSoundCloudTrack[] | CollectionResponse<RawSoundCloudTrack>>(path)
  if (Array.isArray(response)) return { tracks: response.map(mapToImportableTrack) }
  return { tracks: response.collection.map(mapToImportableTrack), nextHref: response.next_href }
}

export async function getMyTracks(): Promise<TrackPage> {
  return fetchTrackPage(`/me/tracks?linked_partitioning=true&limit=${PAGE_SIZE}`)
}

export async function getLikedTracks(): Promise<TrackPage> {
  return fetchTrackPage(`/me/likes/tracks?linked_partitioning=true&limit=${PAGE_SIZE}`)
}

/** Follows a TrackPage's nextHref to fetch the next page, same shape as the first. */
export async function getNextTrackPage(nextHref: string): Promise<TrackPage> {
  return fetchTrackPage(nextHref)
}

export async function getPlaylists(): Promise<Array<{ id: string; title: string; artworkUrl?: string; trackCount: number }>> {
  const response = await scFetchJson<RawSoundCloudPlaylist[] | CollectionResponse<RawSoundCloudPlaylist>>(
    `/me/playlists?linked_partitioning=true&limit=${PAGE_SIZE}`,
  )
  const playlists = Array.isArray(response) ? response : response.collection
  return playlists.map((p) => ({
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

export async function searchTracks(query: string): Promise<TrackPage> {
  if (!query.trim()) return { tracks: [] }
  return fetchTrackPage(`/tracks?q=${encodeURIComponent(query)}&linked_partitioning=true&limit=${PAGE_SIZE}`)
}

// SoundCloud's /tracks search only matches title/tags/description — it does not match
// the uploader's username, so searching an artist's name there often returns nothing even
// though they have tracks. /users search is the separate, correct way to find an artist by
// name; the caller then drills into that artist's own track list below.
export async function searchUsers(query: string): Promise<ImportableArtist[]> {
  if (!query.trim()) return []
  const response = await scFetchJson<RawSoundCloudUser[] | CollectionResponse<RawSoundCloudUser>>(
    `/users?q=${encodeURIComponent(query)}&linked_partitioning=true&limit=10`,
  )
  const users = Array.isArray(response) ? response : response.collection
  return users.map(mapToImportableArtist)
}

export async function getUserTracks(userId: string): Promise<TrackPage> {
  return fetchTrackPage(`/users/${userId}/tracks?linked_partitioning=true&limit=${PAGE_SIZE}`)
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

export interface CreatedSoundCloudPlaylist {
  id: string
  permalinkUrl: string
}

// The one write call in this file (everything else here is read-only). Private by default —
// this is meant for a group's own listening party, not a public release.
//
// The current (Open API) /playlists endpoint requires each track as { urn: "soundcloud:tracks:<id>" },
// not { id: <number> } — the latter matches SoundCloud's older/classic API docs but 422s against
// the live endpoint's strict deserializer (confirmed against their published OpenAPI spec at
// developers.soundcloud.com/docs/api/explorer/open-api.json after a real 422 in testing).
//
// For a private playlist, permalink_url already IS the working share link — SoundCloud embeds
// the secret token as a path segment (".../sets/<slug>/s-<token>?utm_medium=api&..."), not as a
// query param. A prior version of this function appended "?secret_token=..." on top of that,
// producing a URL with two "?" in it that 404s in the widget — confirmed against a real create
// response in production. Nothing needs to be added here; just pass permalink_url through.
export async function createSoundCloudPlaylist(
  title: string,
  trackIds: string[],
  sharing: 'public' | 'private' = 'private',
): Promise<CreatedSoundCloudPlaylist> {
  const raw = await scFetchJson<{ id: number; permalink_url: string }>('/playlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist: { title, sharing, tracks: trackIds.map((id) => ({ urn: `soundcloud:tracks:${id}` })) } }),
  })
  return { id: String(raw.id), permalinkUrl: raw.permalink_url }
}
