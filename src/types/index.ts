import type { TierDef, TierListSong } from './tierlist'
import type { RecapCardStats } from '../lib/recap-card'

// 'lyric'/'spotify' are additive — existing stored games never have these values, so every
// `source === 'soundcloud' | 'local'` check elsewhere keeps working unchanged.
export type TrackSource = 'soundcloud' | 'local' | 'lyric' | 'spotify'

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

  /** source: "spotify" only. spotifyUri (e.g. "spotify:track:...") is what actually gets
   *  played via the Web Playback SDK; spotifyTrackId/spotifyUrl are for display/linking. */
  spotifyTrackId?: string
  spotifyUri?: string
  spotifyUrl?: string

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

  /** Set only on the copy of a reserve round that sudden death appends to Game.rounds — marks it
   *  so a restart/rematch can strip it back out. Never set on a round in the normal list. */
  tiebreaker?: boolean

  createdAt: string
}

export interface Team {
  id: string
  name: string
  color: string // tailwind-safe hex used for scoreboard styling
  score: number
  /** Optional mascot emoji shown alongside the team name. Absent on every team created before this existed. */
  avatar?: string
  /** Consecutive possessions this team has scored on (Song/Lyric/Year's single-winner award()
   *  path only — Tier Guess's multi-team credit toggles don't feed this, since "streak" isn't
   *  a clean concept when several teams can score the same possession). Reset to 0 on any
   *  no-score or another team's score. Absent/0 on every team predating this. */
  streak?: number
  /** How many of each power-up this team has spent so far this playthrough (remaining =
   *  Game.powerUpAllowance − this). Absent on every team predating power-ups; reset on restart. */
  powerUpsUsed?: Partial<Record<PowerUpKind, number>>
  /** Earned-power-ups games only (Game.earnedPowerUps): how many of each this team has earned
   *  from streaks so far. Reset on restart. */
  powerUpsEarned?: Partial<Record<PowerUpKind, number>>
  // Per-game tallies that feed the season/stats awards (lib/achievements.ts). All absent on
  // teams from before they existed, and reset on restart/duplicate like score is.
  /** Longest run of consecutive scored possessions this playthrough. */
  bestStreak?: number
  /** Furthest this team ever trailed the leading team, in points — a game-winner with a big
   *  number here came back from behind. */
  maxDeficit?: number
  /** Times the host ejected this team (Eject gag). */
  ejections?: number
  /** Power-ups handed to this team outright by the underdog catch-up (Game.catchUp), on top of
   *  its allowance/earned stock. */
  powerUpsGifted?: Partial<Record<PowerUpKind, number>>
  /** Whether this team has already received its one-time catch-up gift this playthrough. */
  catchUpGifted?: boolean
}

/** One phone player's tallies for a single game (only recorded for Phone Buzz-In players —
 *  a no-phone local buzz has no individual to attribute to). Keyed by name across games. */
export interface PlayerStat {
  name: string
  /** The team they were last on in this game. */
  teamName: string
  buzzes: number
  correct: number
  wrong: number
  points: number
  /** Fastest buzz reaction in ms, if any were timed. */
  fastestMs?: number
}

export interface GameProgress {
  possessionIndex: number
  completed: boolean
}

export type GameMode = 'song' | 'lyric' | 'tierguess' | 'year'

// Song/Lyric modes only (the single-winner award() path) — Tier Guess/Year's multi-team
// credit-toggle scoring is structurally different (several teams can get partial credit on
// one clue) and isn't wired up for power-ups. Each team gets a limited number of each kind
// per game (Game.powerUpAllowance), spent when armed and refunded if un-armed.
export type PowerUpKind = 'double' | 'steal' | 'freeze'
export const POWER_UP_KINDS: PowerUpKind[] = ['double', 'steal', 'freeze']
export const DEFAULT_POWER_UPS_PER_TEAM = 1

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
  /** Phone buzz-in room code, generated once and reused for this game's whole life so
   *  players don't need to rejoin with a new code after a host page refresh. */
  buzzerRoomCode?: string
  /** Lyric/Tier Guess/Year modes only — length in seconds of the host-started "answer
   *  timer" countdown. Absent (every game predating this) falls back to DEFAULT_ANSWER_TIMER_SECONDS. */
  answerTimerSeconds?: number
  /** Opt-in pause for a score check partway through — only fires with 4+ rounds. Absent/false
   *  on every game predating this and on every game the host hasn't explicitly turned it on for. */
  halftimeEnabled?: boolean
  /** Snapshotted once, the moment this playthrough reaches `progress.completed` — same shape
   *  the recap card already renders from. Cleared on restart, so it always reflects the most
   *  recent completed playthrough rather than a stale one. Absent until a game has actually
   *  been played through to the end at least once. */
  recap?: RecapCardStats
  /** Starting power-ups per team, per kind — absent kinds default to DEFAULT_POWER_UPS_PER_TEAM. */
  powerUpAllowance?: Partial<Record<PowerUpKind, number>>
  /** Opt-in at game creation: teams start with no power-ups and earn them by scoring streaks
   *  instead of spending a fixed allowance (see HostController's award()). Absent/false = the
   *  fixed-allowance behavior every game had before this existed. */
  earnedPowerUps?: boolean
  /** Opt-in underdog help (Song/Lyric): a team trailing by a lot scores a bonus point, and the
   *  first time it falls far behind it's gifted a Steal. Absent/false = off. */
  catchUp?: boolean
  /** Rounds held back for sudden death — only played if the game ends tied (flag: sudden-death).
   *  One is appended to `rounds` (as a copy flagged `tiebreaker`) per tie-break attempt. */
  tiebreakerRounds?: SongRound[]
  /** Set while sudden death is in progress: the teams still tied for the lead (everyone else
   *  sits it out). Cleared on restart. */
  suddenDeath?: { contenderIds: string[] } | null
  /** Per-player tallies for the phone players this playthrough, snapshotted at game end. */
  playerStats?: PlayerStat[]
  /** Song/Lyric modes only — Double/Steal armed by a team for its NEXT scoring possession via
   *  HostController's award(). Applies (and clears) the moment that team is actually awarded —
   *  not tied to a specific clue, so it carries forward if the armed team doesn't score right
   *  away. At most one entry per team. */
  armedPowerUps?: { teamId: string; kind: 'double' | 'steal' }[]
  /** Song/Lyric modes only — Freezes a team (byTeamId) has used on a rival (targetTeamId): the
   *  target is blocked from buzzing on the NEXT clue's window (phone path seeds BuzzerRoom's
   *  `iced` set, no-phone path seeds keyboardIcedRef). Consumed the instant that window opens. */
  freezes?: { byTeamId: string; targetTeamId: string }[]
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
// Lyric/Tier Guess/Year modes' answer-timer fallback — used whenever a game (or a game
// predating Game.answerTimerSeconds entirely) hasn't set its own value.
export const DEFAULT_ANSWER_TIMER_SECONDS = 20

// Cycles for team #9+ rather than hard-capping — scoreboard/award UI wrap to handle
// any team count, so there's no structural reason to cap it.
export const TEAM_COLORS = ['#e8871e', '#17b8a6', '#a855f7', '#ff3b3b', '#3fa9f5', '#ffd23f', '#22c55e', '#f472b6']

export function teamColorForIndex(index: number): string {
  return TEAM_COLORS[index % TEAM_COLORS.length]
}

// Fixed palette, same "pick from a curated set" philosophy as TEAM_COLORS — keeps every
// mascot legible at scoreboard-digit size rather than letting hosts type in arbitrary emoji.
export const TEAM_AVATARS = ['🏀', '🔥', '⚡', '🎯', '🚀', '👑', '🦁', '🐺', '🐐', '🎃', '👻', '⭐']

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

/** Power-ups a team still has of one kind — a fixed per-game allowance by default, or (in an
 *  earned-power-ups game) whatever it's earned from streaks so far, minus what it's spent. */
export function powerUpsRemaining(game: Pick<Game, 'powerUpAllowance' | 'earnedPowerUps'>, team: Team, kind: PowerUpKind): number {
  const base = game.earnedPowerUps
    ? (team.powerUpsEarned?.[kind] ?? 0)
    : (game.powerUpAllowance?.[kind] ?? DEFAULT_POWER_UPS_PER_TEAM)
  const total = base + (team.powerUpsGifted?.[kind] ?? 0)
  return Math.max(0, total - (team.powerUpsUsed?.[kind] ?? 0))
}

export function createTeam(name: string, color: string, avatar?: string): Team {
  return { id: crypto.randomUUID(), name, color, score: 0, avatar }
}

/** A team back at the start of a fresh playthrough: no score, streak, power-ups spent/earned/gifted or
 *  per-game tallies. Identity (id, name, colour, mascot) is kept. */
export function resetTeamTallies(team: Team): Team {
  return { ...team, score: 0, streak: 0, powerUpsUsed: undefined, powerUpsEarned: undefined, powerUpsGifted: undefined, catchUpGifted: undefined, bestStreak: undefined, maxDeficit: undefined, ejections: undefined }
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
    rounds: game.rounds.filter((r) => !r.tiebreaker).map((r) => ({ ...r, id: crypto.randomUUID() })),
    tiebreakerRounds: game.tiebreakerRounds?.map((r) => ({ ...r, id: crypto.randomUUID() })),
    catchUp: game.catchUp,
    teams: game.teams.map((t) => ({ ...resetTeamTallies(t), id: crypto.randomUUID() })),
    powerUpAllowance: game.powerUpAllowance,
    earnedPowerUps: game.earnedPowerUps,
    createdAt: now,
    updatedAt: now,
    mode: game.mode,
    tierListTiers: game.tierListTiers,
    sourceTierListId: game.sourceTierListId,
    tags: game.tags,
  }
}
