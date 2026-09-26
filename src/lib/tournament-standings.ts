import type { Game } from '../types'

export interface TournamentStanding {
  name: string
  color: string
  totalScore: number
  gamesPlayed: number
}

// Only completed games count — an in-progress game's scores are still changing, so
// including them would make the running leaderboard flicker as the host plays through it.
// Teams are matched by name (case/whitespace-insensitive) across games since each Game has
// its own independent team ids — there's no shared contestant roster in this lightweight
// design (see types/tournament.ts).
export function computeStandings(games: Game[]): TournamentStanding[] {
  const byName = new Map<string, TournamentStanding>()

  for (const game of games) {
    if (!game.progress?.completed) continue
    for (const team of game.teams) {
      const key = team.name.trim().toLowerCase()
      if (!key) continue
      const existing = byName.get(key)
      if (existing) {
        existing.totalScore += team.score
        existing.gamesPlayed += 1
      } else {
        byName.set(key, { name: team.name.trim(), color: team.color, totalScore: team.score, gamesPlayed: 1 })
      }
    }
  }

  return Array.from(byName.values()).sort((a, b) => b.totalScore - a.totalScore)
}
