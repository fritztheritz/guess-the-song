// Mirrors the message shapes handled by worker/src/buzzer-room.js — kept in sync by hand
// since the Worker is plain JS and the two can't share a types file across that boundary.

export type BuzzState = 'closed' | 'open' | 'locked'

export interface BuzzerTeam {
  id: string
  name: string
  color: string
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

export type HostOutMessage =
  | { type: 'sync-teams'; teams: BuzzerTeam[] }
  | { type: 'open' }
  | { type: 'close' }
  /** The team that just buzzed got it wrong — ice them out and reopen for everyone else. */
  | { type: 'wrong'; teamId: string }

export type PlayerOutMessage = { type: 'join'; name: string; teamId: string } | { type: 'buzz' }

export type ServerMessage =
  | { type: 'state'; buzzState: BuzzState; winner: BuzzerWinner | null; order: BuzzerWinner[]; iced: string[] }
  | { type: 'roster'; players: BuzzerPlayer[] }
  | { type: 'teams'; teams: BuzzerTeam[] }
  | { type: 'joined'; connId: string }
