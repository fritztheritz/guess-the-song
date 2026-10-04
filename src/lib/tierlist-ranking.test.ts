import { describe, expect, it } from 'vitest'
import { moveSong, rankedCount, songsInGroup, tierListResultsText } from './tierlist-ranking'
import { createEmptyTierList, applyTierPreset, type TierList } from '../types/tierlist'

function listWith(n: number): TierList {
  const l = createEmptyTierList('Mix')
  l.songs = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, soundcloudTrackId: `${i}`, title: `Song ${i}`, artist: '', tierId: null, order: i }))
  return l
}

describe('moveSong', () => {
  it('files a song at the end of a tier and renumbers the pool', () => {
    const l = listWith(3)
    const next = moveSong(l, 's1', l.tiers[0].id, null)
    expect(songsInGroup(next, l.tiers[0].id).map((s) => s.id)).toEqual(['s1'])
    expect(songsInGroup(next, null).map((s) => [s.id, s.order])).toEqual([['s0', 0], ['s2', 1]])
  })
  it('inserts before a given song', () => {
    let l = listWith(3)
    const tier = l.tiers[0].id
    l = moveSong(moveSong(l, 's0', tier, null), 's1', tier, null)
    expect(songsInGroup(moveSong(l, 's2', tier, 's0'), tier).map((s) => s.id)).toEqual(['s2', 's0', 's1'])
  })
  it('ignores a move onto itself or an unknown song', () => {
    const l = listWith(2)
    expect(moveSong(l, 's0', null, 's0')).toBe(l)
    expect(moveSong(l, 'nope', null, null)).toBe(l)
  })
})

describe('helpers', () => {
  it('counts ranked songs and writes results text', () => {
    let l = listWith(2)
    l = moveSong(l, 's0', l.tiers[0].id, null)
    expect(rankedCount(l)).toBe(1)
    expect(tierListResultsText(l)).toContain('S: Song 0')
    expect(tierListResultsText(l)).toContain('Unranked: Song 1')
  })
  it('keeps rankings by position when switching tier presets', () => {
    let l = listWith(2)
    l = moveSong(moveSong(l, 's0', l.tiers[0].id, null), 's1', l.tiers[4].id, null)
    const next = applyTierPreset(l, ['Love', 'Nope'])
    expect(next.tiers.map((t) => t.name)).toEqual(['Love', 'Nope'])
    expect(next.songs.find((s) => s.id === 's0')!.tierId).toBe(l.tiers[0].id)
    expect(next.songs.find((s) => s.id === 's1')!.tierId).toBeNull()
  })
})
