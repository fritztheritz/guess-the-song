import { createGame, createTeam, type Game, type Team } from '../types'

/** A game with teams at the given scores — for tests. */
export function gameWith(scores: number[], patch: Partial<Game> = {}): Game {
  const teams: Team[] = scores.map((score, i) => ({ ...createTeam(`Team ${i + 1}`, '#fff'), id: `t${i + 1}`, score }))
  return { ...createGame('Test', teams), ...patch }
}
