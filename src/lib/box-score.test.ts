import { describe, expect, it } from 'vitest'
import { buildBoxScore } from './box-score'
import { gameWith } from './test-helpers'

describe('buildBoxScore', () => {
  it('is null without a replay log', () => {
    expect(buildBoxScore(gameWith([3, 1]))).toBeNull()
  })

  it('lines up per-possession points and counting stats, best team first', () => {
    const game = gameWith([5, 7], {
      history: [
        { index: 0, title: 'A', artist: 'x', scores: { t1: 3, t2: 0 }, gains: { t1: 3 } },
        { index: 1, title: 'B', artist: 'x', scores: { t1: 3, t2: 4 }, gains: { t2: 4 } },
        { index: 2, title: 'C', artist: 'x', scores: { t1: 5, t2: 7 }, gains: { t1: 2, t2: 3 } },
      ],
    })
    const box = buildBoxScore(game)!
    expect(box.rows.map((r) => r.teamId)).toEqual(['t2', 't1'])
    expect(box.leaderIds).toEqual(['t2'])
    const t2 = box.rows[0]
    expect(t2.cells).toEqual([0, 4, 3])
    expect(t2.scored).toBe(2)
    expect(t2.best).toBe(4)
    expect(t2.streak).toBe(2)
    expect(t2.ppp).toBeCloseTo(7 / 3)
    expect(box.rows[1].streak).toBe(1)
  })

  it('reports a tie for the lead', () => {
    const game = gameWith([2, 2], { history: [{ index: 0, title: 'A', artist: 'x', scores: { t1: 2, t2: 2 }, gains: { t1: 2, t2: 2 } }] })
    expect(buildBoxScore(game)!.leaderIds.sort()).toEqual(['t1', 't2'])
  })
})
