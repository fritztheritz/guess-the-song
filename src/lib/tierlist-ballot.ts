import type { TierList } from '../types/tierlist'

// Group ranking rides on the draft's existing `ballot` message (an array of short strings, at most
// 20 of up to 100 chars) so no Worker change is needed. A ballot is one tier per song, in the order
// the host sent the songs: each song is a single digit (its tier's index, 0 = best), packed 90 to a
// string. That fits well over a thousand songs.

const CHUNK = 90
const MAX_TIERS = 9

export function encodeTierBallot(tierIndexes: number[]): string[] {
  const digits = tierIndexes.map((n) => String(n))
  const out: string[] = []
  for (let i = 0; i < digits.length; i += CHUNK) out.push(digits.slice(i, i + CHUNK).join(''))
  return out
}

/** One tier index per song, or null if the ballot isn't exactly one valid tier for every song. */
export function decodeTierBallot(parts: string[], songCount: number, tierCount: number): number[] | null {
  const joined = parts.join('')
  if (joined.length !== songCount || tierCount > MAX_TIERS) return null
  const out: number[] = []
  for (const ch of joined) {
    const n = Number(ch)
    if (!Number.isInteger(n) || n >= tierCount) return null
    out.push(n)
  }
  return out
}

export interface SongConsensus {
  songId: string
  /** Mean tier index across ballots (0 = best); null with no ballots. */
  mean: number | null
  /** The tier the group landed on — the mean rounded to the nearest tier. */
  tierIndex: number | null
}

export function groupConsensus(songIds: string[], ballots: number[][]): SongConsensus[] {
  return songIds.map((songId, i) => {
    if (ballots.length === 0) return { songId, mean: null, tierIndex: null }
    const mean = ballots.reduce((sum, b) => sum + b[i], 0) / ballots.length
    return { songId, mean, tierIndex: Math.round(mean) }
  })
}

/** Puts every consensus song in its group tier, best average first within a tier. */
export function applyConsensus(list: TierList, consensus: SongConsensus[]): TierList {
  const byId = new Map(consensus.map((c) => [c.songId, c]))
  const placed = list.songs
    .filter((s) => byId.get(s.id)?.tierIndex != null)
    .sort((a, b) => byId.get(a.id)!.mean! - byId.get(b.id)!.mean! || a.title.localeCompare(b.title))
  const counters = new Map<string, number>()
  const orderOf = new Map<string, { tierId: string; order: number }>()
  for (const s of placed) {
    const tierId = list.tiers[byId.get(s.id)!.tierIndex!]?.id
    if (!tierId) continue
    const n = counters.get(tierId) ?? 0
    counters.set(tierId, n + 1)
    orderOf.set(s.id, { tierId, order: n })
  }
  return { ...list, songs: list.songs.map((s) => (orderOf.has(s.id) ? { ...s, ...orderOf.get(s.id)! } : s)) }
}
