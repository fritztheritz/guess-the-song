import type { Team } from './index'
import type { ImportableSpotifyTrack } from '../lib/spotify/spotify-tracks'
import type { BestStreak, TeamTally } from '../lib/streaks'

// Guess the Popularity is its own top-level entity, same call as tier lists/drafts — it's
// not a round-based possession game (there's exactly one artist, one board, played end to
// end in one sitting), so it doesn't fit Game's rounds/possessions shape.

export interface PopularityTrack {
  spotifyTrackId: string
  spotifyUri: string
  spotifyUrl?: string
  title: string
  artist: string
  artworkUrl?: string
}

export interface PopularityRank {
  /** 1 = most popular, 10 (or fewer, for an artist without a full top 10) = least. */
  rank: number
  track: PopularityTrack
}

/** A wrong guess for the rank currently in play — cleared the moment that rank is solved. */
export interface PopularityAttempt {
  teamId: string
  title: string
}

export interface PopularitySolved {
  track: PopularityTrack
  teamId: string
}

export interface PopularityProgress {
  /** 1-indexed into `ranks`; once it exceeds ranks.length the board is fully solved. */
  currentRank: number
  /** Index into `teams` — whose turn it is right now. Advances by one after every single
   *  guess, right or wrong, so turns keep rotating through the whole team list regardless
   *  of outcome (nobody's stuck always going first, nobody's rewarded with an extra turn). */
  turnTeamIndex: number
  attempts: PopularityAttempt[]
  solved: Record<number, PopularitySolved>
  completed: boolean
  /** Consecutive ranks solved by the same team — a rank someone else solves, or one that's
   *  revealed-and-skipped, resets it. Absent on games saved before streak bonuses existed. */
  streak?: BestStreak
  /** Longest streak reached this game, for the Stats page. */
  bestStreak?: BestStreak
  /** Right/wrong guesses per team id, for the Stats page. */
  tally?: TeamTally
}

export interface PopularityGame {
  id: string
  name: string
  artistId: string
  artistName: string
  artistImageUrl?: string
  /** Always sorted by rank ascending; length is min(10, however many top tracks Spotify has for this artist). */
  ranks: PopularityRank[]
  /** A bounded pool (not the artist's whole discography) used for the guess picker's
   *  filter-as-you-type list — always includes every track in `ranks` even if search
   *  didn't happen to surface all of them itself. */
  autocompletePool: PopularityTrack[]
  teams: Team[]
  /** Seconds each team gets per turn before it's passed on; absent/0 = untimed. */
  turnTimerSeconds?: number
  /** Phone Buzz-In room, same idea as Game.buzzerRoomCode — persisted so reloading the
   *  host page doesn't hand out a new code players would have to rejoin with. */
  buzzerRoomCode?: string
  createdAt: string
  updatedAt: string
  progress: PopularityProgress
}

export function trackFromImportable(t: ImportableSpotifyTrack): PopularityTrack {
  return {
    spotifyTrackId: t.spotifyTrackId,
    spotifyUri: t.spotifyUri,
    spotifyUrl: t.spotifyUrl,
    title: t.title,
    artist: t.artist,
    artworkUrl: t.artworkUrl,
  }
}

export function createInitialProgress(): PopularityProgress {
  return { currentRank: 1, turnTeamIndex: 0, attempts: [], solved: {}, completed: false }
}
