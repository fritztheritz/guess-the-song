import { describe, expect, it } from 'vitest'
import { acceptPick, closestMatch, comparePlayers, mostUnique, orderOf, similarity, songStats, type BlindPicks, type BlindPlayer } from './blind-rank'

const player = (name: string, slots: number[]): BlindPlayer => ({ name, slots })
const picksOf = (...ps: BlindPlayer[]): BlindPicks => Object.fromEntries(ps.map((p) => [p.name.toLowerCase(), p]))

describe('acceptPick', () => {
  it('records a slot for a song and keeps picks per player', () => {
    const r = acceptPick({}, 'Ann', 0, 3, 5)
    expect(r.accepted).toBe(true)
    expect(r.picks.ann.slots).toEqual([3, 0, 0, 0, 0])
  })
  it('matches a player by name however it is capitalised', () => {
    let picks = acceptPick({}, 'Ann', 0, 3, 5).picks
    picks = acceptPick(picks, ' ANN ', 1, 1, 5).picks
    expect(Object.keys(picks)).toEqual(['ann'])
    expect(picks.ann.slots).toEqual([3, 1, 0, 0, 0])
  })
  it('rejects a slot already used, a second pick for the same song, and out-of-range numbers', () => {
    const picks = acceptPick({}, 'Ann', 0, 3, 5).picks
    expect(acceptPick(picks, 'Ann', 1, 3, 5)).toMatchObject({ accepted: false, reason: 'slot_taken' })
    expect(acceptPick(picks, 'Ann', 0, 4, 5)).toMatchObject({ accepted: false, reason: 'already_picked' })
    expect(acceptPick(picks, 'Ann', 1, 6, 5)).toMatchObject({ accepted: false, reason: 'out_of_range' })
    expect(acceptPick(picks, 'Ann', 1, 0, 5)).toMatchObject({ accepted: false, reason: 'out_of_range' })
    expect(acceptPick(picks, 'Ann', 9, 1, 5)).toMatchObject({ accepted: false, reason: 'bad_song' })
  })
  it('never changes the picks it was given', () => {
    const picks = acceptPick({}, 'Ann', 0, 3, 5).picks
    const before = JSON.stringify(picks)
    acceptPick(picks, 'Ann', 1, 2, 5)
    expect(JSON.stringify(picks)).toBe(before)
  })
})

describe('orderOf', () => {
  it('lists songs best slot first and leaves out unplaced ones', () => {
    expect(orderOf(player('A', [2, 0, 1, 3]))).toEqual([2, 0, 3])
  })
})

describe('similarity', () => {
  it('is 1 for identical lists and 0 for exactly reversed ones', () => {
    expect(similarity(player('A', [1, 2, 3, 4]), player('B', [1, 2, 3, 4]))).toBe(1)
    expect(similarity(player('A', [1, 2, 3, 4]), player('B', [4, 3, 2, 1]))).toBe(0)
  })
  it('sits between for a partial agreement', () => {
    const s = similarity(player('A', [1, 2, 3, 4]), player('B', [2, 1, 3, 4]))!
    expect(s).toBeGreaterThan(0.5)
    expect(s).toBeLessThan(1)
  })
  it('only compares songs both placed, and needs at least two', () => {
    expect(similarity(player('A', [1, 2, 0, 0]), player('B', [1, 2, 3, 4]))).toBe(1)
    expect(similarity(player('A', [1, 0, 0]), player('B', [1, 2, 3]))).toBeNull()
  })
})

describe('group comparisons', () => {
  const picks = picksOf(player('Ann', [1, 2, 3, 4]), player('Bo', [1, 2, 4, 3]), player('Cy', [4, 3, 2, 1]))
  it('ranks pairs by how alike they are', () => {
    const pairs = comparePlayers(picks)
    expect(pairs).toHaveLength(3)
    expect(pairs[0]).toMatchObject({ a: 'Ann', b: 'Bo' })
  })
  it("finds each player's closest match", () => {
    expect(closestMatch(picks, 'Ann')?.name).toBe('Bo')
    expect(closestMatch(picks, 'bo')?.name).toBe('Ann')
    expect(closestMatch(picks, 'Cy')?.similarity).toBe(0)
    expect(closestMatch(picks, 'Nobody')).toBeNull()
  })
  it('names the odd one out only with three or more players', () => {
    expect(mostUnique(picks)?.name).toBe('Cy')
    expect(mostUnique(picksOf(player('A', [1, 2]), player('B', [2, 1])))).toBeNull()
  })
})

describe('songStats', () => {
  it('averages slots per song and measures how split the group was', () => {
    const picks = picksOf(player('A', [1, 3]), player('B', [1, 1]), player('C', [1, 2]))
    const [first, second] = songStats(picks, 2)
    expect(first).toMatchObject({ song: 0, mean: 1, spread: 0, count: 3 })
    expect(second.mean).toBe(2)
    expect(second.spread).toBeGreaterThan(0)
  })
  it('skips songs nobody placed', () => {
    expect(songStats(picksOf(player('A', [1, 0])), 2)).toHaveLength(1)
  })
})
