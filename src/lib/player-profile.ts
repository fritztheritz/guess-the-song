import type { Game } from '../types'
import { aggregatePlayers } from './achievements'

// A phone player's career across every completed game, matched by name (case-insensitive) — the
// same matching the leaderboard uses, so a profile always agrees with the row that links to it.

export interface PlayerGameLine {
  gameId: string
  gameName: string
  /** When the game was last saved (used as its date). */
  date: string
  teamName: string
  points: number
  correct: number
  wrong: number
  buzzes: number
  fastestMs?: number
  /** Their team finished alone in front. */
  teamWon: boolean
}

export interface PlayerProfile {
  name: string
  color: string
  games: number
  wins: number
  points: number
  correct: number
  wrong: number
  buzzes: number
  /** correct ÷ (correct + wrong), or null with no graded guesses. */
  accuracy: number | null
  pointsPerGame: number
  fastestMs?: number
  /** The team they've played for most often. */
  favoriteTeam: string
  bestGame: PlayerGameLine | null
  /** Newest first. */
  lines: PlayerGameLine[]
  /** Place on the player leaderboard (1 = top) out of `ofPlayers`. */
  rank: number
  ofPlayers: number
}

export const playerKey = (name: string): string => name.trim().toLowerCase()

export function buildPlayerProfile(games: Game[], name: string): PlayerProfile | null {
  const key = playerKey(name)
  const lines: PlayerGameLine[] = []
  let display = name
  for (const g of games) {
    if (!g.progress?.completed) continue
    const stat = (g.playerStats ?? []).find((p) => playerKey(p.name) === key)
    if (!stat) continue
    display = stat.name
    const top = Math.max(...g.teams.map((t) => t.score))
    const leaders = g.teams.filter((t) => t.score === top)
    const team = g.teams.find((t) => t.name === stat.teamName)
    lines.push({
      gameId: g.id,
      gameName: g.name,
      date: g.updatedAt,
      teamName: stat.teamName,
      points: stat.points,
      correct: stat.correct,
      wrong: stat.wrong,
      buzzes: stat.buzzes,
      fastestMs: stat.fastestMs,
      teamWon: !!team && leaders.length === 1 && leaders[0].id === team.id,
    })
  }
  if (lines.length === 0) return null
  lines.sort((a, b) => b.date.localeCompare(a.date))

  const sum = (pick: (l: PlayerGameLine) => number) => lines.reduce((n, l) => n + pick(l), 0)
  const correct = sum((l) => l.correct)
  const wrong = sum((l) => l.wrong)
  const teamCounts = new Map<string, number>()
  for (const l of lines) teamCounts.set(l.teamName, (teamCounts.get(l.teamName) ?? 0) + 1)
  const favoriteTeam = [...teamCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const timed = lines.filter((l) => l.fastestMs !== undefined).map((l) => l.fastestMs as number)
  const board = aggregatePlayers(games)
  const color = games.flatMap((g) => g.teams).find((t) => t.name === lines[0].teamName)?.color ?? '#e8871e'
  const points = sum((l) => l.points)

  return {
    name: display,
    color,
    games: lines.length,
    wins: lines.filter((l) => l.teamWon).length,
    points,
    correct,
    wrong,
    buzzes: sum((l) => l.buzzes),
    accuracy: correct + wrong > 0 ? correct / (correct + wrong) : null,
    pointsPerGame: points / lines.length,
    fastestMs: timed.length > 0 ? Math.min(...timed) : undefined,
    favoriteTeam,
    bestGame: [...lines].sort((a, b) => b.points - a.points)[0],
    lines,
    rank: Math.max(1, board.findIndex((r) => playerKey(r.name) === key) + 1),
    ofPlayers: board.length,
  }
}
