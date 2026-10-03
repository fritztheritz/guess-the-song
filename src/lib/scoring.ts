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
  /** Guess the Popularity / Timeline: a correct placement (before streak bonus). */
  popularity: 2,
  timeline: 2,
  /** Popularity/Timeline streak bonus cap (see lib/streaks.ts). */
  maxStreakBonus: 3,
} as const

/** Host-screen timings that aren't game rules, kept next to the rules so they're easy to find. */
export const TIMING = {
  earnBannerMs: 3200,
  ejectBannerMs: 2600,
} as const

/** A guess as a number, or null when it isn't one (tolerates a leading "#", as in "#3"). */
export function parseGuessNumber(text: string): number | null {
  const t = text.trim().replace(/^#/, '')
  const n = Number(t)
  return t !== '' && Number.isFinite(n) ? n : null
}

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

/** Each team's standing (1 = leading), ties sharing a place — a snapshot to compare against later. */
export function ranksOf(teams: Team[]): Record<string, number> {
  const ranks: Record<string, number> = {}
  for (const t of teams) ranks[t.id] = 1 + teams.filter((o) => o.score > t.score).length
  return ranks
}

/** Places each team has climbed (+) or dropped (−) since `from` was taken. */
export function rankMoves(from: Record<string, number> | undefined, teams: Team[]): Record<string, number> {
  if (!from) return {}
  const now = ranksOf(teams)
  const moves: Record<string, number> = {}
  for (const t of teams) if (from[t.id] !== undefined) moves[t.id] = from[t.id] - now[t.id]
  return moves
}
