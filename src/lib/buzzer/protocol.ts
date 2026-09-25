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
}

export type HostOutMessage =
  | { type: 'sync-teams'; teams: BuzzerTeam[] }
  | { type: 'open' }
  | { type: 'close' }

export type PlayerOutMessage = { type: 'join'; name: string; teamId: string } | { type: 'buzz' }

export type ServerMessage =
  | { type: 'state'; buzzState: BuzzState; winner: BuzzerWinner | null; order: BuzzerWinner[] }
  | { type: 'roster'; players: BuzzerPlayer[] }
  | { type: 'teams'; teams: BuzzerTeam[] }
  | { type: 'joined'; connId: string }
