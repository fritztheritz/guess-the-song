export type TrackSource = 'soundcloud' | 'local'

export type SoundCloudAccess = 'playable' | 'preview' | 'blocked'

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
  points: number[] // e.g. [4, 3, 2, 1], same length as clipDurations

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

export interface Game {
  id: string
  name: string
  rounds: SongRound[]
  teams: Team[]
  createdAt: string
  updatedAt: string
  /** Absent = never played (or was reset). Presence is what tells Presentation mode to offer Continue/Restart. */
  progress?: GameProgress
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

export function createTeam(name: string, color: string): Team {
  return { id: crypto.randomUUID(), name, color, score: 0 }
}

export function createGame(name: string, teams: Team[]): Game {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    rounds: [],
    teams,
    createdAt: now,
    updatedAt: now,
  }
}
