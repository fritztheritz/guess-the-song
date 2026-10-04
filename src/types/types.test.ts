import { describe, expect, it } from 'vitest'
import { duplicateGame, powerUpsRemaining, resetTeamTallies } from './index'
import { gameWith } from '../lib/test-helpers'

describe('resetTeamTallies', () => {
  it('clears score and per-game tallies but keeps identity', () => {
    const t = { ...gameWith([9]).teams[0], streak: 4, bestStreak: 4, ejections: 2, powerUpsUsed: { double: 1 }, catchUpGifted: true }
    const reset = resetTeamTallies(t)
    expect(reset).toMatchObject({ id: 't1', name: 'Team 1', score: 0, streak: 0 })
    expect(reset.bestStreak).toBeUndefined()
    expect(reset.powerUpsUsed).toBeUndefined()
    expect(reset.catchUpGifted).toBeUndefined()
  })
})

describe('duplicateGame', () => {
  it('copies as a fresh unplayed game with new ids', () => {
    const g = gameWith([7, 3], { catchUp: true })
    g.progress = { possessionIndex: 2, completed: false }
    const copy = duplicateGame(g)
    expect(copy.id).not.toBe(g.id)
    expect(copy.teams.map((t) => t.score)).toEqual([0, 0])
    expect(copy.teams[0].id).not.toBe('t1')
    expect(copy.catchUp).toBe(true)
    expect(copy.progress).toBeUndefined()
  })
})

describe('powerUpsRemaining', () => {
  it('uses the allowance, minus used, plus gifted', () => {
    const g = gameWith([0])
    expect(powerUpsRemaining(g, g.teams[0], 'double')).toBe(1)
    const team = { ...g.teams[0], powerUpsUsed: { double: 1 }, powerUpsGifted: { double: 2 } }
    expect(powerUpsRemaining(g, team, 'double')).toBe(2)
  })
  it('starts at zero in an earned-power-ups game', () => {
    const g = gameWith([0], { earnedPowerUps: true })
    expect(powerUpsRemaining(g, g.teams[0], 'steal')).toBe(0)
    expect(powerUpsRemaining(g, { ...g.teams[0], powerUpsEarned: { steal: 2 } }, 'steal')).toBe(2)
  })
})
