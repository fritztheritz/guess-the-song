import { describe, expect, it } from 'vitest'
import { applyCatchUpGift, computeAward, creditMultiplier, settleGuessPossession, underdogBonusFor } from './awards'
import { SCORING } from './scoring'
import { gameWith } from './test-helpers'

const score = (g: { teams: { score: number }[] }) => g.teams.map((t) => t.score)

describe('computeAward', () => {
  it('scores the winner and extends their streak, resetting the others', () => {
    const g = gameWith([0, 0])
    g.teams[1].streak = 3
    const { game, points } = computeAward(g, g.teams[0], { basePoints: 4, powerUps: false })
    expect(points).toBe(4)
    expect(score(game)).toEqual([4, 0])
    expect(game.teams.map((t) => t.streak)).toEqual([1, 0])
  })

  it('breaks every streak when nobody scores', () => {
    const g = gameWith([3, 3])
    g.teams.forEach((t) => (t.streak = 2))
    const { game, points } = computeAward(g, null, { basePoints: 4, powerUps: false })
    expect(points).toBe(4)
    expect(score(game)).toEqual([3, 3])
    expect(game.teams.map((t) => t.streak)).toEqual([0, 0])
  })

  it('doubles points for an armed Double, then spends it', () => {
    const g = gameWith([0, 0], { armedPowerUps: [{ teamId: 't1', kind: 'double' }] })
    const { game, points } = computeAward(g, g.teams[0], { basePoints: 3, powerUps: true })
    expect(points).toBe(6)
    expect(game.armedPowerUps).toEqual([])
  })

  it('docks the best other team on an armed Steal', () => {
    const g = gameWith([0, 7, 2], { armedPowerUps: [{ teamId: 't1', kind: 'steal' }] })
    const { game } = computeAward(g, g.teams[0], { basePoints: 3, powerUps: true })
    expect(score(game)).toEqual([3, 4, 2])
  })

  it("leaves an armed power-up alone when a different team scores", () => {
    const g = gameWith([0, 0], { armedPowerUps: [{ teamId: 't1', kind: 'double' }] })
    const { game, points } = computeAward(g, g.teams[1], { basePoints: 3, powerUps: true })
    expect(points).toBe(3)
    expect(game.armedPowerUps).toEqual([{ teamId: 't1', kind: 'double' }])
  })

  it('gives the underdog bonus only when catch-up is on and the deficit is big enough', () => {
    const on = gameWith([0, SCORING.underdogDeficit], { catchUp: true })
    expect(computeAward(on, on.teams[0], { basePoints: 2, powerUps: false }).points).toBe(2 + SCORING.underdogBonus)
    const close = gameWith([0, SCORING.underdogDeficit - 1], { catchUp: true })
    expect(computeAward(close, close.teams[0], { basePoints: 2, powerUps: false }).points).toBe(2)
    const off = gameWith([0, 20])
    expect(computeAward(off, off.teams[0], { basePoints: 2, powerUps: false }).points).toBe(2)
  })

  it('skips the underdog bonus on a wager', () => {
    const g = gameWith([0, 20], { catchUp: true })
    expect(computeAward(g, g.teams[0], { basePoints: 5, isWager: true, powerUps: false }).points).toBe(5)
  })

  it('earns a power-up on every second scored possession in a row', () => {
    const g = gameWith([0, 0], { earnedPowerUps: true })
    g.teams[0].streak = 1
    const { game, banners } = computeAward(g, g.teams[0], { basePoints: 1, powerUps: true, pickKind: () => 'steal' })
    expect(game.teams[0].powerUpsEarned).toEqual({ steal: 1 })
    expect(banners.join(' ')).toContain('earned')
    const first = computeAward(gameWith([0, 0], { earnedPowerUps: true }), gameWith([0, 0]).teams[0], { basePoints: 1, powerUps: true })
    expect(first.game.teams[0].powerUpsEarned).toBeUndefined()
  })
})

describe('applyCatchUpGift', () => {
  it('gifts a free Steal once to a team far behind, and only with power-ups on', () => {
    const g = gameWith([0, SCORING.catchUpGiftDeficit], { catchUp: true })
    const gifted = applyCatchUpGift(g, true)
    expect(gifted.game.teams[0].powerUpsGifted).toEqual({ steal: 1 })
    expect(gifted.game.teams[0].catchUpGifted).toBe(true)
    expect(applyCatchUpGift(gifted.game, true).game.teams[0].powerUpsGifted).toEqual({ steal: 1 })
    expect(applyCatchUpGift(g, false).game).toBe(g)
  })
})

describe('creditMultiplier / underdogBonusFor', () => {
  it('doubles only for the armed team', () => {
    const g = gameWith([0, 0], { armedPowerUps: [{ teamId: 't1', kind: 'double' }] })
    expect(creditMultiplier(g, 't1')).toBe(2)
    expect(creditMultiplier(g, 't2')).toBe(1)
  })
  it('is zero unless catch-up is on', () => {
    const g = gameWith([0, 30])
    expect(underdogBonusFor(g.teams, g.teams[0], false)).toBe(0)
    expect(underdogBonusFor(g.teams, g.teams[0], true)).toBe(SCORING.underdogBonus)
  })
})

describe('settleGuessPossession (Tier/Year)', () => {
  it('adds the underdog bonus for teams that scored while far behind', () => {
    // After the possession: t1 has 3 (gained 3), t2 has 10 (gained 0) -> before: 0 vs 10.
    const g = gameWith([3, 10], { catchUp: true })
    const { game } = settleGuessPossession(g, { t1: 3 }, { powerUps: false })
    expect(score(game)).toEqual([3 + SCORING.underdogBonus, 10])
  })

  it('applies Steal against the leader and spends it', () => {
    const g = gameWith([4, 9], { armedPowerUps: [{ teamId: 't1', kind: 'steal' }] })
    const { game } = settleGuessPossession(g, { t1: 4 }, { powerUps: true })
    expect(score(game)).toEqual([4, 5])
    expect(game.armedPowerUps).toEqual([])
  })

  it('keeps a power-up armed for a team that scored nothing', () => {
    const g = gameWith([0, 5], { armedPowerUps: [{ teamId: 't1', kind: 'double' }] })
    const { game } = settleGuessPossession(g, { t2: 2 }, { powerUps: true })
    expect(game.armedPowerUps).toEqual([{ teamId: 't1', kind: 'double' }])
  })

  it('earns a power-up when a scoring team hits an even streak', () => {
    const g = gameWith([0, 0], { earnedPowerUps: true })
    g.teams[0].streak = 2
    const { game } = settleGuessPossession(g, { t1: 1 }, { powerUps: true, pickKind: () => 'double' })
    expect(game.teams[0].powerUpsEarned).toEqual({ double: 1 })
  })
})
