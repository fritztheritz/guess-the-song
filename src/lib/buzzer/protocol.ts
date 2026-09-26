// Mirrors the message shapes handled by worker/src/buzzer-room.js — kept in sync by hand
// since the Worker is plain JS and the two can't share a types file across that boundary.

export type BuzzState = 'closed' | 'open' | 'locked'

export interface BuzzerTeam {
  id: string
  name: string
  color: string
  avatar?: string
}

export interface BuzzerPlayer {
  connId: string
  name: string
  teamId: string
}

export interface BuzzerWinner {
  connId: string
  name: string
  teamId: string
  at: number
  /** Milliseconds from the clue's buzzer window opening to this buzz — null if it somehow
   *  landed before the server ever recorded an 'open' (shouldn't normally happen). */
  reactionMs: number | null
}

export type PhonePhase = 'resume' | 'intro' | 'clue' | 'revealed' | 'final' | 'halftime'
export type PhoneMode = 'song' | 'lyric' | 'tierguess' | 'year'

// A deliberately reduced view of the game, computed host-side and pushed down through the
// same room every buzz already flows through — Phone Buzz-In's players are on their own
// devices (not a second screen on the host's machine), so they can't read localStorage the
// way Public Display does over BroadcastChannel. `revealed`/`clueText` are only ever
// populated with what's already safe to show for the current phase, same discipline as
// Public Display: never hand a phone the answer before the host has revealed it.
export interface PhoneRoundState {
  gameName: string
  possessionIndex: number
  totalPossessions: number
  phase: PhonePhase
  mode: PhoneMode
  /** Safe-to-show prompt during 'clue' (e.g. the Lyric prompt) — null when there's nothing
   *  beyond "a clip is playing" to show, or outside the 'clue' phase. */
  clueText: string | null
  /** Only set once phase is 'revealed' — the answer, simplified (no tier/year staging). */
  revealed: { title: string; artist: string; artworkUrl?: string; lyricAnswer?: string } | null
  teams: Array<{ id: string; name: string; color: string; score: number; avatar?: string }>
}

export type HostOutMessage =
  | { type: 'sync-teams'; teams: BuzzerTeam[] }
  | { type: 'sync-round'; state: PhoneRoundState }
  | { type: 'open' }
  | { type: 'close' }
  /** The team that just buzzed got it wrong — ice them out and reopen for everyone else. */
  | { type: 'wrong'; teamId: string }

export type PlayerOutMessage = { type: 'join'; name: string; teamId: string } | { type: 'buzz' }

export type ServerMessage =
  | { type: 'state'; buzzState: BuzzState; winner: BuzzerWinner | null; order: BuzzerWinner[]; iced: string[] }
  | { type: 'roster'; players: BuzzerPlayer[] }
  | { type: 'teams'; teams: BuzzerTeam[] }
  | { type: 'round'; state: PhoneRoundState }
  | { type: 'joined'; connId: string }
