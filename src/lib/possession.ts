import type { Game } from '../types'

// Decisions about how a game moves from one possession to the next — kept out of the Host
// Controller so the rules (when halftime fires, who's in a tiebreak) can be tested.

/** Whether moving into possession `next` should pause for halftime: the game has it on, is long
 *  enough to have a meaningful middle, and `next` is the halfway point (and it hasn't already
 *  been shown this playthrough). */
export function isHalftime(game: Pick<Game, 'rounds' | 'halftimeEnabled'>, next: number, alreadyShown: boolean): boolean {
  return !!game.halftimeEnabled && game.rounds.length >= 4 && next === Math.floor(game.rounds.length / 2) && !alreadyShown
}

/** Team ids tied for the lead — the sudden-death contenders — or null when there's a clear winner
 *  (or fewer than two teams). */
export function tiedLeaders(game: Pick<Game, 'teams'>): string[] | null {
  if (game.teams.length < 2) return null
  const top = Math.max(...game.teams.map((t) => t.score))
  const tied = game.teams.filter((t) => t.score === top)
  return tied.length >= 2 ? tied.map((t) => t.id) : null
}
