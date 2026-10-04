import { describe, expect, it } from 'vitest'
import { applyScoreDeltas, parseGuessNumber, rankMoves, ranksOf, settleStreaks } from './scoring'
import { gameWith } from './test-helpers'

describe('parseGuessNumber', () => {
  it('reads plain numbers and a leading #', () => {
    expect(parseGuessNumber('3')).toBe(3)
    expect(parseGuessNumber(' #12 ')).toBe(12)
  })
  it('rejects anything else', () => {
    expect(parseGuessNumber('')).toBeNull()
    expect(parseGuessNumber('abc')).toBeNull()
    expect(parseGuessNumber('Infinity')).toBeNull()
  })
})

describe('applyScoreDeltas', () => {
  it('adds each team its delta, negatives included', () => {
    const next = applyScoreDeltas(gameWith([5, 5]), { t1: 3, t2: -2 })
    expect(next.teams.map((t) => t.score)).toEqual([8, 3])
  })
  it('only records progress when given a possession', () => {
    const g = gameWith([0, 0])
    expect(applyScoreDeltas(g, { t1: 1 }).progress).toBeUndefined()
    expect(applyScoreDeltas(g, { t1: 1 }, 4).progress).toEqual({ possessionIndex: 4, completed: false })
  })
  it('tracks the furthest a team has trailed', () => {
    const next = applyScoreDeltas(gameWith([0, 0]), { t1: 6 })
    expect(next.teams[1].maxDeficit).toBe(6)
  })
})

describe('settleStreaks', () => {
  it('continues streaks for credited teams and resets everyone else', () => {
    const g = gameWith([0, 0, 0])
    g.teams[0].streak = 2
    g.teams[1].streak = 4
    const next = settleStreaks(g.teams, new Set(['t1']))
    expect(next.map((t) => t.streak)).toEqual([3, 0, 0])
    expect(next[0].bestStreak).toBe(3)
  })
})

describe('ranks', () => {
  it('shares a place between tied teams', () => {
    expect(ranksOf(gameWith([10, 10, 4]).teams)).toEqual({ t1: 1, t2: 1, t3: 3 })
  })
  it('reports places climbed and dropped', () => {
    const before = ranksOf(gameWith([10, 5]).teams)
    expect(rankMoves(before, gameWith([6, 9]).teams)).toEqual({ t1: -1, t2: 1 })
    expect(rankMoves(undefined, gameWith([1, 2]).teams)).toEqual({})
  })
})
