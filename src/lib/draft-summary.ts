import type { DraftBoard } from '../types/draft'

/** At-a-glance numbers for a draft board — shown on Home and at the top of the board page. */
export interface DraftSummary {
  sessions: number
  completed: number
  inProgress: number
  songsTotal: number
  songsAvailable: number
  songsUsed: number
  /** ISO time of the most recent session activity (completion, else creation), if any. */
  lastPlayed?: string
}

export function summarizeDraftBoard(board: DraftBoard): DraftSummary {
  const songsAvailable = board.songPool.filter((s) => !s.takenBySessionId).length
  const stamps = board.sessions.map((s) => s.completedAt ?? s.createdAt).sort()
  return {
    sessions: board.sessions.length,
    completed: board.sessions.filter((s) => s.phase === 'complete').length,
    inProgress: board.sessions.filter((s) => s.phase !== 'complete').length,
    songsTotal: board.songPool.length,
    songsAvailable,
    songsUsed: board.songPool.length - songsAvailable,
    lastPlayed: stamps[stamps.length - 1],
  }
}
