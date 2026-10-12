import { describe, expect, it } from 'vitest'
import { createEmptyTierList } from '../types/tierlist'
import type { TierListSong } from '../types/tierlist'
import { emptySlots, nextEmptySlot, placeInSlot, rankingToTierList } from './slot-ranking'

const song = (n: number): TierListSong => ({ id: `s${n}`, soundcloudTrackId: `${n}`, title: `T${n}`, artist: 'A', tierId: null, order: 0 })

describe('slot ranking', () => {
  it('fills a slot once and never lets a song go in twice', () => {
    const a = placeInSlot(emptySlots(3), 1, 0)!
    expect(a).toEqual([null, 0, null])
    expect(placeInSlot(a, 1, 1)).toBeNull()
    expect(placeInSlot(a, 2, 0)).toBeNull()
    expect(placeInSlot(a, 5, 1)).toBeNull()
  })

  it('walks to the nearest empty slot', () => {
    const slots = [0, null, 1, null]
    expect(nextEmptySlot(slots, 1, 1)).toBe(3)
    expect(nextEmptySlot(slots, 3, -1)).toBe(1)
    expect(nextEmptySlot(slots, 3, 1)).toBe(3)
  })

  it('spreads a finished ranking across the tiers, best first', () => {
    const src = createEmptyTierList('x', ['S', 'A'])
    const songs = [0, 1, 2, 3].map(song)
    const out = rankingToTierList(src, songs, [2, 0, 3, 1], 'Group')
    const byTier = (i: number) => out.songs.filter((s) => s.tierId === out.tiers[i].id).sort((a, b) => a.order - b.order).map((s) => s.title)
    expect(byTier(0)).toEqual(['T2', 'T0'])
    expect(byTier(1)).toEqual(['T3', 'T1'])
    expect(out.id).not.toBe(src.id)
  })
})
