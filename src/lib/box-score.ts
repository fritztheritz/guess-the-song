import type { Game } from '../types'

// A basketball-style box score for a finished game: a line score (what each team put up every possession)
// plus a few per-team counting stats. Built purely from the replay log, so games played before the log
// existed simply have none.

export interface BoxScoreRow {
  teamId: string
  name: string
  color: string
  avatar?: string
  /** Points gained in each possession, in order (0 = nothing). */
  cells: number[]
  total: number
  /** Possessions in which the team gained points. */
  scored: number
  /** Their best single possession. */
  best: number
  /** Longest run of consecutive possessions with points. */
  streak: number
  /** Points per possession. */
  ppp: number
}

export interface BoxScore {
  possessions: { index: number; title: string }[]
  rows: BoxScoreRow[]
  /** Teams sharing the top total (more than one = a tie). */
  leaderIds: string[]
}

export function buildBoxScore(game: Game): BoxScore | null {
  const history = game.history ?? []
  if (history.length === 0) return null
  const rows: BoxScoreRow[] = game.teams.map((team) => {
    const cells = history.map((h) => h.gains[team.id] ?? 0)
    let streak = 0
    let run = 0
    for (const c of cells) {
      run = c > 0 ? run + 1 : 0
      streak = Math.max(streak, run)
    }
    return {
      teamId: team.id,
      name: team.name,
      color: team.color,
      avatar: team.avatar,
      cells,
      total: team.score,
      scored: cells.filter((c) => c > 0).length,
      best: Math.max(0, ...cells),
      streak,
      ppp: team.score / history.length,
    }
  })
  rows.sort((a, b) => b.total - a.total)
  const top = rows[0]?.total
  return {
    possessions: history.map((h) => ({ index: h.index, title: h.title })),
    rows,
    leaderIds: rows.filter((r) => r.total === top).map((r) => r.teamId),
  }
}
