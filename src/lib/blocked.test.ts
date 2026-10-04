import { describe, expect, it } from 'vitest'
import { blockedTeams } from './blocked'
import { gameWith } from './test-helpers'

describe('blockedTeams', () => {
  it('marks ejected teams', () => {
    expect(blockedTeams(gameWith([0, 0]), ['t2']).get('t2')).toBe('ejected')
  })
  it('sits out everyone not in the sudden-death tiebreak', () => {
    const g = gameWith([5, 5, 1], { suddenDeath: { contenderIds: ['t1', 't2'] } })
    expect([...blockedTeams(g, []).entries()]).toEqual([['t3', 'sitting-out']])
  })
  it('lets an ejection win over sitting out', () => {
    const g = gameWith([5, 5, 1], { suddenDeath: { contenderIds: ['t1', 't2'] } })
    expect(blockedTeams(g, ['t3']).get('t3')).toBe('ejected')
  })
  it('is empty with no game', () => {
    expect(blockedTeams(null, []).size).toBe(0)
  })
})
