import { SCORING } from './scoring'

// Shared by Guess the Popularity and Guess the Timeline — both reward a team that keeps
// scoring, and both track the same per-team right/wrong tally for the Stats page.

/** Extra points on top of a normal score once a team is on a streak: nothing for the first
 *  hit, +1 for the second in a row, +2 for the third, capped so a long run can't snowball. */
export const MAX_STREAK_BONUS = SCORING.maxStreakBonus

export function streakBonus(count: number): number {
  return Math.max(0, Math.min(count - 1, MAX_STREAK_BONUS))
}

export interface GuessTally {
  right: number
  wrong: number
}

export type TeamTally = Record<string, GuessTally>

export function bumpTally(tally: TeamTally | undefined, teamId: string, outcome: 'right' | 'wrong'): TeamTally {
  const prev = tally?.[teamId] ?? { right: 0, wrong: 0 }
  return { ...tally, [teamId]: { ...prev, [outcome]: prev[outcome] + 1 } }
}

export interface BestStreak {
  teamId: string
  count: number
}

export function betterStreak(best: BestStreak | undefined, teamId: string, count: number): BestStreak | undefined {
  return !best || count > best.count ? { teamId, count } : best
}
