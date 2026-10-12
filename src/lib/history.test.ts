import { describe, expect, it } from 'vitest'
import { cumulativeSeries, recordPossession, summarizeReplay } from './history'
import { gameWith } from './test-helpers'
import type { Game } from '../types'

// Plays a tiny game by hand: [t1, t2] scores after each possession.
function play(rows: Array<[number, number]>): Game {
  let g = gameWith([0, 0])
  let prev: Record<string, number> = { t1: 0, t2: 0 }
  rows.forEach(([a, b], i) => {
    g = { ...g, teams: g.teams.map((t, j) => ({ ...t, score: j === 0 ? a : b })) }
    g = recordPossession(g, i, { title: `Song ${i}`, artist: 'X', startScores: prev })
    prev = { t1: a, t2: b }
  })
  return g
}

describe('recordPossession', () => {
  it('logs scores and what each team gained, leaving out teams that did not move', () => {
    const g = play([[4, 0], [4, 3]])
    expect(g.history![0]).toMatchObject({ scores: { t1: 4, t2: 0 }, gains: { t1: 4 } })
    expect(g.history![1].gains).toEqual({ t2: 3 })
  })
  it('replaces an entry when a possession is replayed, keeping order', () => {
    let g = play([[4, 0], [4, 3]])
    g = recordPossession(g, 0, { title: 'Redo', artist: 'X', startScores: { t1: 0, t2: 0 } })
    expect(g.history!.map((h) => h.index)).toEqual([0, 1])
    expect(g.history![0].title).toBe('Redo')
  })
})

describe('cumulativeSeries', () => {
  it('starts from the score before possession one', () => {
    const series = cumulativeSeries(play([[4, 0], [4, 3]]))
    expect(series[0].points).toEqual([0, 4, 4])
    expect(series[1].points).toEqual([0, 0, 3])
  })
  it('is flat with no history', () => {
    expect(cumulativeSeries(gameWith([2, 1]))[0].points).toEqual([0])
  })
})

describe('summarizeReplay', () => {
  it('counts lead changes and finds the biggest possession', () => {
    const s = summarizeReplay(play([[4, 0], [4, 6], [9, 6]]))
    expect(s.leadChanges).toBe(2)
    expect(s.biggest).toMatchObject({ points: 6, teamId: 't2', index: 1 })
  })
  it('spots a comeback win and scoreless possessions', () => {
    const s = summarizeReplay(play([[0, 5], [0, 5], [9, 5]]))
    expect(s.comeback).toEqual({ teamId: 't1', deficit: 5 })
    expect(s.scoreless).toBe(1)
  })
  it('has no comeback when the winner never trailed far', () => {
    expect(summarizeReplay(play([[4, 3], [8, 3]])).comeback).toBeNull()
  })
})
