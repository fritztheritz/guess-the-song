import { trackTeamStats } from './achievements'
import type { Game, Team } from '../types'

// Every number that decides how many points something is worth, in one place so balancing the
// game doesn't mean hunting through HostController. Fixed, not host-editable (same "fixed slots"
// philosophy as Guess the Lyric's hint points) — Song/Lyric clue points live on the round itself.
export const SCORING = {
  /** Tier Guess: right tier. */
  tier: 1,
  /** Tier Guess: closest position (host-judged, ties all count). */
  position: 2,
  /** Tier Guess: naming the exact position — on top of `position`. */
  positionExact: 3,
  /** Year Guess: right year. */
  year: 1,
  /** Year Guess: closest month. */
  month: 2,
  /** Year Guess: naming the exact month — on top of `month`. */
  monthExact: 3,
  /** Underdog catch-up (Game.catchUp): trailing the leader by this much earns a bonus point... */
  underdogDeficit: 8,
  underdogBonus: 1,
  /** ...and falling this far behind gifts a one-time free Steal. */
  catchUpGiftDeficit: 12,
  /** Earned power-ups: one is awarded every this-many scored possessions in a row. */
  earnedPowerUpEvery: 2,
  /** Sudden death: the deciding point. */
  suddenDeath: 1,
} as const

/** Adds `deltas` (teamId → points, negatives allowed) to the game's scores and folds the
 *  per-team tallies forward. The one place every non-Song/Lyric scoring path funnels through,
 *  so a combined change (several teams, several credits) is a single save from one snapshot. */
export function applyScoreDeltas(game: Game, deltas: Record<string, number>, possessionIndex?: number): Game {
  const teams = trackTeamStats(game.teams.map((t) => (deltas[t.id] ? { ...t, score: t.score + deltas[t.id] } : t)))
  return possessionIndex === undefined ? { ...game, teams } : { ...game, teams, progress: { possessionIndex, completed: false } }
}

/** Streaks for modes where several teams can score the same possession (Tier/Year Guess):
 *  anyone credited this possession continues their streak, everyone else resets — the
 *  multi-credit equivalent of what award() does for a single winner. */
export function settleStreaks(teams: Team[], scoredTeamIds: Set<string>): Team[] {
  return trackTeamStats(teams.map((t) => ({ ...t, streak: scoredTeamIds.has(t.id) ? (t.streak ?? 0) + 1 : 0 })))
}
