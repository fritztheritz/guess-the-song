import { teamColorForIndex } from './index'

// A tier list is deliberately its own top-level entity (own storage key, own id space)
// rather than a mode on Game — a ranked list of songs isn't a round-based possession
// game, and keeping it separate means the finished ranking can be handed off as the
// starting data for a future game type without unpicking it from Game's shape.

export interface TierDef {
  id: string
  name: string
  color: string
}

export interface TierListSong {
  id: string
  soundcloudTrackId: string
  soundcloudUrn?: string
  soundcloudUrl?: string
  soundcloudSecretToken?: string
  title: string
  artist: string
  artworkUrl?: string
  /** True when artworkUrl was generated locally (the track had no SoundCloud artwork) rather than fetched. */
  generatedArtwork?: boolean
  /** null = still sitting in the unranked pool. */
  tierId: string | null
  /** Position within its tier (or the unranked pool) — lower sorts first. */
  order: number
}

export interface TierList {
  id: string
  name: string
  tiers: TierDef[]
  songs: TierListSong[]
  createdAt: string
  updatedAt: string
}

export const MIN_TIERS = 2
export const MAX_TIERS = 8

const DEFAULT_TIER_NAMES = ['S', 'A', 'B', 'C', 'D']

export function createTierDef(name: string, index: number): TierDef {
  return { id: crypto.randomUUID(), name, color: teamColorForIndex(index) }
}

export function createEmptyTierList(name: string): TierList {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    tiers: DEFAULT_TIER_NAMES.map((n, i) => createTierDef(n, i)),
    songs: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** Clones a tier list as a fresh copy — new id/tier ids/song ids, same rankings preserved. */
export function duplicateTierList(list: TierList): TierList {
  const now = new Date().toISOString()
  const tierIdMap = new Map(list.tiers.map((t) => [t.id, crypto.randomUUID()]))
  return {
    id: crypto.randomUUID(),
    name: `${list.name} (Copy)`,
    tiers: list.tiers.map((t) => ({ ...t, id: tierIdMap.get(t.id)! })),
    songs: list.songs.map((s) => ({ ...s, id: crypto.randomUUID(), tierId: s.tierId ? (tierIdMap.get(s.tierId) ?? null) : null })),
    createdAt: now,
    updatedAt: now,
  }
}
