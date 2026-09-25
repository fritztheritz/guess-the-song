import type { TierDef, TierListSong } from './tierlist'

// 'lyric' is additive — existing stored games never have this value, so every
// `source === 'soundcloud' | 'local'` check elsewhere keeps working unchanged.
export type TrackSource = 'soundcloud' | 'local' | 'lyric'

export type SoundCloudAccess = 'playable' | 'preview' | 'blocked'

// Guess the Lyric is "finish the lyric": lyricPrompt (line 1) is shown constantly as the
// question; players guess lyricAnswer (line 2). The 3 hints below are revealed one at a
// time to help — guessing cold (no hints) is worth points[0], each hint after that maps to
// points[1..3]. Fixed rather than host-configurable, mirroring Guess the Song's fixed
// clue-duration slots.
export const LYRIC_HINT_LABELS = ['Who sang the verse?', 'What playlist is it on?', "What's the song called?"] as const

export interface SongRound {
  id: string
  source: TrackSource

  title: string
  artist: string
  artworkUrl?: string

  soundcloudTrackId?: string
  soundcloudUrn?: string
  soundcloudUrl?: string
  /** Needed to resolve playback for tracks shared via a private link (not owned by the connected user). */
  soundcloudSecretToken?: string

  /** Only set for source: "local" (dev/testing fallback). Never persisted to a shared backend. */
  localAudioUrl?: string

  isPrivate?: boolean
  access?: SoundCloudAccess

  duration?: number // seconds, full track length

  clipStart: number // seconds, where all clue clips begin
  clipDurations: number[] // e.g. [2, 4, 7, 10]
  points: number[] // e.g. [4, 3, 2, 1] — canonical clue count for BOTH modes; always read this, not clipDurations.length

  // mode: "year" only, below. Host-entered, since SoundCloud track metadata doesn't
  // reliably carry a real release date (especially for uploads/remixes/private tracks).
  /** The song's actual release year — the coarse first-stage guess, worth YEAR_GUESS_YEAR_POINTS. */
  releaseYear?: number
  /** 1-12 — the fine second-stage guess, worth YEAR_GUESS_MONTH_POINTS. */
  releaseMonth?: number

  // Jeopardy-style Daily Double, available on song/lyric rounds only (not tierguess/year,
  // which already use their own multi-team credit-toggle scoring rather than a single
  // pick-a-winner grid). Set in the builder; who's wagering and how much is chosen live by
  // the host at presentation time, so it isn't stored here.
  wager?: boolean

  // source: "lyric" only, below. `title`/`artist` are reused as the "song name" and "who
  // sang it" hint content (and for display in lists elsewhere), same as for song rounds.
  /** The first lyric line — shown constantly as the prompt, not a staged hint. */
  lyricPrompt?: string
  /** The second lyric line — what players are actually guessing; shown on reveal. */
  lyricAnswer?: string
  /** Free-text playlist hint content, e.g. "70s Classics". Distinct from playlistUrl below. */
  playlistHint?: string
  /** Optional clickable link shown on reveal, parallel to soundcloudUrl for song rounds. */
  playlistUrl?: string

  // mode: "tierguess" only, below. source stays "soundcloud" (it genuinely is one) — these
  // are snapshotted from the source TierList at import time, same one-time-copy convention
  // as every other import in this app, so they stay stable even if that tier list changes
  // or is deleted afterward.
  /** The song's real tier id at import time — references Game.tierListTiers, not TierList.tiers. */
  tierId?: string
  /** 0-indexed position within that tier at import time (0 = ranked first/best). */
  tierPosition?: number
  /** How many songs were in that tier at import time, for a "#N of M" display. */
  tierSize?: number

  createdAt: string
}

export interface Team {
  id: string
  name: string
  color: string // tailwind-safe hex used for scoreboard styling
  score: number
}

export interface GameProgress {
  possessionIndex: number
  completed: boolean
}

export type GameMode = 'song' | 'lyric' | 'tierguess' | 'year'

export interface Game {
  id: string
  name: string
  rounds: SongRound[]
  teams: Team[]
  createdAt: string
  updatedAt: string
  /** Absent = never played (or was reset). Presence is what tells Presentation mode to offer Continue/Restart. */
  progress?: GameProgress
  /** Absent on every game created before this existed — always treat that as 'song', never assume it's set. */
  mode?: GameMode
  /** mode: "tierguess" only — snapshot of the source tier list's tier defs (id/name/color)
   *  at import time, so "guess the tier" always has a stable set of options even if the
   *  source tier list is edited or deleted afterward. */
  tierListTiers?: TierDef[]
  /** mode: "tierguess" only — which TierList this game was built from. Provenance/display
   *  only (e.g. so the builder knows which list "+ Add More Songs" should pull from) —
   *  never read live for round data, same as every other import in this app. */
  sourceTierListId?: string
  /** Free-form, host-assigned labels for organizing the Home page once there are lots of
   *  games — e.g. "Friday Night", "90s Hip-Hop". Absent/empty on every game predating this. */
  tags?: string[]
}

/** Every existing stored game predates `mode` — this is the one place that should ever default it. */
export function isLyricMode(game: Pick<Game, 'mode'>): boolean {
  return game.mode === 'lyric'
}

export function isTierGuessMode(game: Pick<Game, 'mode'>): boolean {
  return game.mode === 'tierguess'
}

export function isYearMode(game: Pick<Game, 'mode'>): boolean {
  return game.mode === 'year'
}

export const DEFAULT_CLIP_DURATIONS = [2, 4, 7, 10]
export const DEFAULT_POINTS = [4, 3, 2, 1]

// Cycles for team #9+ rather than hard-capping — scoreboard/award UI wrap to handle
// any team count, so there's no structural reason to cap it.
export const TEAM_COLORS = ['#e8871e', '#17b8a6', '#a855f7', '#ff3b3b', '#3fa9f5', '#ffd23f', '#22c55e', '#f472b6']

export function teamColorForIndex(index: number): string {
  return TEAM_COLORS[index % TEAM_COLORS.length]
}

export function createEmptyRound(partial: Partial<SongRound> & Pick<SongRound, 'title' | 'artist' | 'source'>): SongRound {
  return {
    id: crypto.randomUUID(),
    clipStart: 0,
    clipDurations: DEFAULT_CLIP_DURATIONS,
    points: DEFAULT_POINTS,
    createdAt: new Date().toISOString(),
    ...partial,
  }
}

export function createEmptyLyricRound(): SongRound {
  return createEmptyRound({
    source: 'lyric',
    title: 'New Song',
    artist: 'Unknown Artist',
    lyricPrompt: '',
    lyricAnswer: '',
  })
}

/** Builds a tierguess round from a ranked TierListSong — a one-time snapshot, same as
 *  every other import in this app. `tierSize` is the count of songs in that tier at
 *  import time (the caller computes it from the source TierList, since a TierListSong
 *  alone doesn't know its tier's total size). */
export function createTierGuessRound(song: TierListSong, tierSize: number): SongRound {
  return createEmptyRound({
    source: 'soundcloud',
    title: song.title,
    artist: song.artist,
    artworkUrl: song.artworkUrl,
    soundcloudTrackId: song.soundcloudTrackId,
    soundcloudUrn: song.soundcloudUrn,
    soundcloudUrl: song.soundcloudUrl,
    soundcloudSecretToken: song.soundcloudSecretToken,
    tierId: song.tierId ?? undefined,
    tierPosition: song.order,
    tierSize,
  })
}

export function createTeam(name: string, color: string): Team {
  return { id: crypto.randomUUID(), name, color, score: 0 }
}

export function createGame(name: string, teams: Team[], mode: GameMode = 'song'): Game {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    rounds: [],
    teams,
    createdAt: now,
    updatedAt: now,
    mode,
  }
}

/** Clones a game as a fresh, unplayed copy — new id/round ids/team ids, scores and progress reset. */
export function duplicateGame(game: Game): Game {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: `${game.name} (Copy)`,
    rounds: game.rounds.map((r) => ({ ...r, id: crypto.randomUUID() })),
    teams: game.teams.map((t) => ({ ...t, id: crypto.randomUUID(), score: 0 })),
    createdAt: now,
    updatedAt: now,
    mode: game.mode,
    tierListTiers: game.tierListTiers,
    sourceTierListId: game.sourceTierListId,
    tags: game.tags,
  }
}
