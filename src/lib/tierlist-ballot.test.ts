import { describe, expect, it } from 'vitest'
import { applyConsensus, decodeTierBallot, encodeTierBallot, groupConsensus } from './tierlist-ballot'
import { createEmptyTierList, type TierList } from '../types/tierlist'

describe('tier ballot packing', () => {
  it('round-trips and chunks long ballots', () => {
    const choices = Array.from({ length: 200 }, (_, i) => i % 5)
    const parts = encodeTierBallot(choices)
    expect(parts.length).toBe(3)
    expect(parts.every((p) => p.length <= 100)).toBe(true)
    expect(decodeTierBallot(parts, 200, 5)).toEqual(choices)
  })
  it('rejects the wrong length or an out-of-range tier', () => {
    expect(decodeTierBallot(['0123'], 5, 5)).toBeNull()
    expect(decodeTierBallot(['0125'], 4, 5)).toBeNull()
    expect(decodeTierBallot(['01x3'], 4, 5)).toBeNull()
  })
})

describe('group consensus', () => {
  const list = (): TierList => {
    const l = createEmptyTierList('T')
    l.songs = ['a', 'b', 'c'].map((id, i) => ({ id, soundcloudTrackId: id, title: id, artist: '', tierId: null, order: i }))
    return l
  }
  it('averages ballots per song and rounds to a tier', () => {
    const c = groupConsensus(['a', 'b', 'c'], [[0, 1, 4], [0, 2, 4]])
    expect(c.map((x) => x.mean)).toEqual([0, 1.5, 4])
    expect(c.map((x) => x.tierIndex)).toEqual([0, 2, 4])
  })
  it('has no result without ballots', () => {
    expect(groupConsensus(['a'], [])[0]).toEqual({ songId: 'a', mean: null, tierIndex: null })
  })
  it('files songs into their group tier, best average first', () => {
    const l = list()
    const next = applyConsensus(l, groupConsensus(['a', 'b', 'c'], [[1, 1, 3]]))
    const tierOf = (id: string) => next.songs.find((s) => s.id === id)!
    expect(tierOf('a').tierId).toBe(l.tiers[1].id)
    expect(tierOf('b').tierId).toBe(l.tiers[1].id)
    expect(tierOf('c').tierId).toBe(l.tiers[3].id)
    expect(new Set([tierOf('a').order, tierOf('b').order]).size).toBe(2)
  })
})
