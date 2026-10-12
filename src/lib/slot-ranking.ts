import type { TierList, TierListSong } from '../types/tierlist'

// Shared-screen Blind Ranking: songs arrive one at a time and the group drops each into a numbered
// slot (1 = favourite). A slot, once filled, is final.

/** `slots[i]` is the song index sitting in slot i + 1, or null while it's empty. */
export type Slots = (number | null)[]

export function emptySlots(count: number): Slots {
  return Array.from({ length: count }, () => null)
}

/** Places a song into a slot; null when the slot is out of range or taken, or the song is already placed. */
export function placeInSlot(slots: Slots, slotIndex: number, songIndex: number): Slots | null {
  if (slotIndex < 0 || slotIndex >= slots.length) return null
  if (slots[slotIndex] !== null || slots.includes(songIndex)) return null
  const next = [...slots]
  next[slotIndex] = songIndex
  return next
}

/** The nearest empty slot to `from` in a direction (-1 up, 1 down), or `from` if there is none. */
export function nextEmptySlot(slots: Slots, from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < slots.length; i += dir) if (slots[i] === null) return i
  return from
}

/** Turns a finished ranking into a fresh tier list: the slots are split evenly across the tiers, best first. */
export function rankingToTierList(source: TierList, songs: TierListSong[], slots: Slots, name: string, now = new Date().toISOString()): TierList {
  const tierIds = new Map(source.tiers.map((t) => [t.id, crypto.randomUUID()]))
  const tiers = source.tiers.map((t) => ({ ...t, id: tierIds.get(t.id)! }))
  const placed = slots.flatMap((songIndex, slot) => (songIndex === null ? [] : [{ song: songs[songIndex], slot }]))
  const perTier = new Map<number, number>()
  return {
    ...source,
    id: crypto.randomUUID(),
    name,
    tiers,
    songs: placed.map(({ song, slot }) => {
      const tierIdx = Math.min(tiers.length - 1, Math.floor((slot * tiers.length) / slots.length))
      const order = perTier.get(tierIdx) ?? 0
      perTier.set(tierIdx, order + 1)
      return { ...song, id: crypto.randomUUID(), tierId: tiers[tierIdx].id, order }
    }),
    createdAt: now,
    updatedAt: now,
  }
}
