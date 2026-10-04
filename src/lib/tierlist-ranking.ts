import type { TierList } from '../types/tierlist'

/**
 * Moves a song to a tier (or the unranked pool, tierId: null), inserting it immediately
 * before `beforeSongId` within that group, or at the end if `beforeSongId` is null.
 * Renumbers `order` within both the source and destination groups so drag-and-drop
 * reordering stays stable. Pure — returns a new TierList, doesn't mutate.
 */
export function moveSong(list: TierList, songId: string, targetTierId: string | null, beforeSongId: string | null): TierList {
  const moving = list.songs.find((s) => s.id === songId)
  if (!moving) return list
  if (songId === beforeSongId) return list

  const rest = list.songs.filter((s) => s.id !== songId)
  const destGroup = rest.filter((s) => s.tierId === targetTierId).sort((a, b) => a.order - b.order)
  const insertAt = beforeSongId ? destGroup.findIndex((s) => s.id === beforeSongId) : -1
  const idx = insertAt === -1 ? destGroup.length : insertAt
  destGroup.splice(idx, 0, { ...moving, tierId: targetTierId })

  const renumberedDest = destGroup.map((s, i) => ({ ...s, order: i }))
  const others = rest.filter((s) => s.tierId !== targetTierId)

  return { ...list, songs: [...others, ...renumberedDest] }
}

export function songsInGroup(list: TierList, tierId: string | null) {
  return list.songs.filter((s) => s.tierId === tierId).sort((a, b) => a.order - b.order)
}

export function rankedCount(list: TierList): number {
  return list.songs.filter((s) => s.tierId !== null).length
}

/** Randomises the order of the unranked pool, which is also the order songs come up next. */
export function shuffleUnranked(list: TierList): TierList {
  const pool = songsInGroup(list, null)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const order = new Map(pool.map((s, i) => [s.id, i]))
  return { ...list, songs: list.songs.map((s) => (order.has(s.id) ? { ...s, order: order.get(s.id)! } : s)) }
}

/** Plain-text version of the ranking, tier by tier — for pasting into a chat. */
export function tierListResultsText(list: TierList): string {
  const lines = [`${list.name} — tier list`]
  for (const tier of list.tiers) {
    const songs = songsInGroup(list, tier.id)
    if (songs.length > 0) lines.push(`${tier.name}: ${songs.map((s) => s.title).join(' · ')}`)
  }
  const pool = songsInGroup(list, null)
  if (pool.length > 0) lines.push(`Unranked: ${pool.map((s) => s.title).join(' · ')}`)
  return lines.join('\n')
}
