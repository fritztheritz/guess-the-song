import { describe, expect, it } from 'vitest'
import { buildPlayerProfile } from './player-profile'
import { gameWith } from './test-helpers'
import type { Game, PlayerStat } from '../types'

function played(name: string, scores: number[], stats: PlayerStat[], updatedAt: string): Game {
  const g = gameWith(scores, { name, playerStats: stats, updatedAt })
  g.progress = { possessionIndex: 0, completed: true }
  return g
}
const stat = (over: Partial<PlayerStat> = {}): PlayerStat => ({ name: 'Sam', teamName: 'Team 1', buzzes: 4, correct: 3, wrong: 1, points: 9, ...over })

describe('buildPlayerProfile', () => {
  it('is null for someone who never played', () => {
    expect(buildPlayerProfile([played('A', [5, 3], [stat()], '2026-01-01')], 'Nobody')).toBeNull()
  })

  it('totals a player across completed games, matching names loosely', () => {
    const games = [
      played('A', [10, 3], [stat({ points: 9, fastestMs: 900 })], '2026-01-01'),
      played('B', [2, 8], [stat({ name: ' sam ', teamName: 'Team 2', points: 4, correct: 1, wrong: 1, buzzes: 2, fastestMs: 650 })], '2026-02-01'),
    ]
    const p = buildPlayerProfile(games, 'SAM')!
    expect(p.games).toBe(2)
    expect(p.points).toBe(13)
    expect(p.correct).toBe(4)
    expect(p.accuracy).toBeCloseTo(4 / 6)
    expect(p.fastestMs).toBe(650)
    expect(p.wins).toBe(2)
    expect(p.pointsPerGame).toBe(6.5)
    expect(p.bestGame?.gameName).toBe('A')
    expect(p.lines.map((l) => l.gameName)).toEqual(['B', 'A'])
  })

  it('does not count a tied game as a win, or an unfinished game at all', () => {
    const tie = played('Tie', [5, 5], [stat()], '2026-01-01')
    const open = gameWith([9, 0], { name: 'Open', playerStats: [stat()] })
    const p = buildPlayerProfile([tie, open], 'Sam')!
    expect(p.games).toBe(1)
    expect(p.wins).toBe(0)
  })

  it('ranks against the leaderboard', () => {
    const games = [played('A', [5, 1], [stat({ name: 'Sam', points: 3 }), stat({ name: 'Lee', points: 8, teamName: 'Team 2' })], '2026-01-01')]
    const p = buildPlayerProfile(games, 'Sam')!
    expect(p.rank).toBe(2)
    expect(p.ofPlayers).toBe(2)
  })
})
