// 'lyric' is additive — existing stored games never have this value, so every
// `source === 'soundcloud' | 'local'` check elsewhere keeps working unchanged.
export type TrackSource = 'soundcloud' | 'local' | 'lyric'

export type SoundCloudAccess = 'playable' | 'preview' | 'blocked'

// The 4 progressive clue stages for a Guess the Lyric round, in order. Fixed rather than
// host-configurable, mirroring how Guess the Song's 4 clue slots are a fixed shape too.
export const LYRIC_CLUE_LABELS = ['Lyric line 1', 'Lyric line 2', 'Who sang the verse?', 'What playlist is it on?'] as const

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

  /** source: "lyric" only. 4 strings matching LYRIC_CLUE_LABELS' order. Absent on every existing round. */
  lyricClues?: string[]
  /** source: "lyric" only. Optional clickable link shown on reveal, parallel to soundcloudUrl for song rounds. */
  playlistUrl?: string

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

export type GameMode = 'song' | 'lyric'

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
}

/** Every existing stored game predates `mode` — this is the one place that should ever default it. */
export function isLyricMode(game: Pick<Game, 'mode'>): boolean {
  return game.mode === 'lyric'
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
    lyricClues: ['', '', '', ''],
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
  }
}
