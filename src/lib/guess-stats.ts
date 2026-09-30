import type { PopularityGame } from '../types/popularity'
import type { TimelineGame } from '../types/timeline'
import type { GuessTally, BestStreak } from './streaks'

// Aggregates the right/wrong tallies and streaks that Guess the Popularity and Guess the
// Timeline record as they're played. Only completed games count, same reasoning as
// computeStandings — an in-progress game's numbers are still moving. Games finished before
// tallies existed simply have none recorded, so they contribute nothing here.

interface TallySource {
  name: string
  teams: Array<{ id: string; name: string; color: string }>
  progress: { completed: boolean; tally?: Record<string, GuessTally>; bestStreak?: BestStreak }
}

export interface TeamAccuracy {
  name: string
  color: string
  right: number
  wrong: number
}

export interface LongestStreak {
  count: number
  teamName: string
  gameName: string
}

export function computeAccuracy(sources: TallySource[]): TeamAccuracy[] {
  const byName = new Map<string, TeamAccuracy>()
  for (const game of sources) {
    if (!game.progress.completed) continue
    for (const team of game.teams) {
      const tally = game.progress.tally?.[team.id]
      const key = team.name.trim().toLowerCase()
      if (!tally || !key) continue
      const existing = byName.get(key)
      if (existing) {
        existing.right += tally.right
        existing.wrong += tally.wrong
      } else {
        byName.set(key, { name: team.name.trim(), color: team.color, right: tally.right, wrong: tally.wrong })
      }
    }
  }
  return Array.from(byName.values()).sort((a, b) => b.right - a.right)
}

export function findLongestStreak(sources: TallySource[]): LongestStreak | null {
  let best: LongestStreak | null = null
  for (const game of sources) {
    const streak = game.progress.completed ? game.progress.bestStreak : undefined
    if (!streak || streak.count < 2 || (best && streak.count <= best.count)) continue
    const team = game.teams.find((t) => t.id === streak.teamId)
    best = { count: streak.count, teamName: team?.name ?? 'A team', gameName: game.name }
  }
  return best
}

export function tallySources(popularity: PopularityGame[], timeline: TimelineGame[]): TallySource[] {
  return [...popularity, ...timeline]
}
