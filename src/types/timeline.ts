import type { Team } from './index'
import type { ImportableSpotifyTrack } from '../lib/spotify/spotify-tracks'
import type { BestStreak, TeamTally } from '../lib/streaks'

// Guess the Timeline is its own top-level entity, same call as Guess the Popularity — one
// deck, one shared board played end to end, nothing like Game's rounds/possessions.

export interface TimelineSong {
  spotifyTrackId: string
  spotifyUri: string
  spotifyUrl?: string
  title: string
  artist: string
  artworkUrl?: string
  year: number
}

export interface TimelinePlacement {
  song: TimelineSong
  /** Who placed it correctly; '' for the free starting card. */
  teamId: string
}

export interface TimelineMiss {
  song: TimelineSong
  teamId: string
}

export interface TimelineProgress {
  /** Index into `songs` of the mystery song in play. Starts at 1 — songs[0] is the free
   *  starting card already on the timeline. Once it reaches songs.length the deck is done. */
  deckIndex: number
  /** Index into `teams` — advances by one after every placement, right or wrong, same
   *  continuous rotation as Guess the Popularity. */
  turnTeamIndex: number
  /** Cards on the shared timeline, oldest first. Only ever grows on a correct placement. */
  timeline: TimelinePlacement[]
  /** Misplaced songs — revealed, then discarded rather than added to the timeline. */
  missed: TimelineMiss[]
  completed: boolean
  /** Consecutive correct placements per team id (their own turns, not the whole table's). */
  streaks?: Record<string, number>
  bestStreak?: BestStreak
  tally?: TeamTally
}

export interface TimelineGame {
  id: string
  name: string
  /** Shuffled at creation; songs[0] seeds the timeline, the rest are drawn in order. */
  songs: TimelineSong[]
  teams: Team[]
  /** Seconds each team gets per turn before it's passed on; absent/0 = untimed. */
  turnTimerSeconds?: number
  createdAt: string
  updatedAt: string
  progress: TimelineProgress
}

/** True if a song released in `year` belongs at `slot` (0 = before every card, n = after
 *  the last) — ties with a neighbor count as fine, since same-year order can't be known. */
export function isValidSlot(timeline: TimelinePlacement[], slot: number, year: number): boolean {
  const before = slot > 0 ? timeline[slot - 1].song.year : -Infinity
  const after = slot < timeline.length ? timeline[slot].song.year : Infinity
  return before <= year && year <= after
}

/** Where a song really goes on the timeline — after any same-year cards already there. */
export function insertionIndex(timeline: TimelinePlacement[], year: number): number {
  let i = timeline.length
  while (i > 0 && timeline[i - 1].song.year > year) i--
  return i
}

export function songFromImportable(t: ImportableSpotifyTrack): TimelineSong | null {
  if (t.releaseYear === undefined) return null
  return {
    spotifyTrackId: t.spotifyTrackId,
    spotifyUri: t.spotifyUri,
    spotifyUrl: t.spotifyUrl,
    title: t.title,
    artist: t.artist,
    artworkUrl: t.artworkUrl,
    year: t.releaseYear,
  }
}

export function createInitialTimelineProgress(deck: TimelineSong[]): TimelineProgress {
  return { deckIndex: 1, turnTeamIndex: 0, timeline: [{ song: deck[0], teamId: '' }], missed: [], completed: false }
}
