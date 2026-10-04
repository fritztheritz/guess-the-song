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
  /** Free-form, host-assigned labels for organizing the Home page once there are lots of
   *  tier lists. Absent/empty on every tier list predating this. */
  tags?: string[]
}

export const MIN_TIERS = 2
export const MAX_TIERS = 8

/** Ready-made tier sets, best first — offered when creating a list and in the builder. */
export const TIER_PRESETS: { id: string; label: string; names: string[] }[] = [
  { id: 'classic', label: 'S – D', names: ['S', 'A', 'B', 'C', 'D'] },
  { id: 'feelings', label: 'Love · Like · Meh · Nope', names: ['Love it', 'Like it', 'Meh', 'Nope'] },
  { id: 'stars', label: '5 stars', names: ['★★★★★', '★★★★', '★★★', '★★', '★'] },
  { id: 'numbers', label: '1 – 5', names: ['1', '2', '3', '4', '5'] },
]

const DEFAULT_TIER_NAMES = TIER_PRESETS[0].names

/** Best-to-worst colours for a preset's tiers — warm to cool, so the top tier reads as the "hot" one. */
const TIER_COLOR_RAMP = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']

export function tierColorForIndex(index: number): string {
  return TIER_COLOR_RAMP[index % TIER_COLOR_RAMP.length]
}

export function createTierDef(name: string, index: number): TierDef {
  return { id: crypto.randomUUID(), name, color: tierColorForIndex(index) }
}

/** Swaps a list's tiers for a preset's. Tiers are matched by position so rankings carry over
 *  where they can (and keep their colour choice); songs in tiers that no longer exist go back
 *  to unranked. */
export function applyTierPreset(list: TierList, names: string[]): TierList {
  const tiers = names.map((name, i) => (list.tiers[i] ? { ...list.tiers[i], name } : createTierDef(name, i)))
  const keep = new Set(tiers.map((t) => t.id))
  return { ...list, tiers, songs: list.songs.map((s) => (s.tierId && !keep.has(s.tierId) ? { ...s, tierId: null, order: 0 } : s)) }
}

export function createEmptyTierList(name: string, tierNames: string[] = DEFAULT_TIER_NAMES): TierList {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    tiers: tierNames.map((n, i) => createTierDef(n, i)),
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
    tags: list.tags,
  }
}
