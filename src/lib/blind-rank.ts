// Blind Ranking: songs come up one at a time and each player must lock the current song into a numbered
// slot (1 = their favorite) before they hear the next — no take-backs, so you have to guess where the
// songs still to come will fit. Afterwards everyone's lists are compared. Pure, so the rules (one slot
// per song, first pick wins, how "in sync" two lists are) can be tested.

/** Players are matched by lowercase name so a phone that reconnects (new connection id) keeps its picks. */
export const playerKey = (name: string): string => name.trim().toLowerCase()

export interface BlindPlayer {
  name: string
  /** slot[i] = the slot (1..total) this player gave song i, or 0 for no pick. */
  slots: number[]
}

export type BlindPicks = Record<string, BlindPlayer>

export interface PickResult {
  accepted: boolean
  picks: BlindPicks
  reason?: 'out_of_range' | 'slot_taken' | 'already_picked' | 'bad_song'
}

/** Records `slot` for `songIndex` unless it breaks a rule. A pick is final: the first valid one wins. */
export function acceptPick(picks: BlindPicks, name: string, songIndex: number, slot: number, total: number): PickResult {
  if (!Number.isInteger(songIndex) || songIndex < 0 || songIndex >= total) return { accepted: false, picks, reason: 'bad_song' }
  if (!Number.isInteger(slot) || slot < 1 || slot > total) return { accepted: false, picks, reason: 'out_of_range' }
  const key = playerKey(name)
  const player = picks[key] ?? { name: name.trim(), slots: Array.from({ length: total }, () => 0) }
  if (player.slots[songIndex] !== 0) return { accepted: false, picks, reason: 'already_picked' }
  if (player.slots.includes(slot)) return { accepted: false, picks, reason: 'slot_taken' }
  const slots = [...player.slots]
  slots[songIndex] = slot
  return { accepted: true, picks: { ...picks, [key]: { ...player, slots } } }
}

/** Song indexes in a player's order, best slot first (songs they never placed are left out). */
export function orderOf(player: BlindPlayer): number[] {
  return player.slots
    .map((slot, song) => ({ slot, song }))
    .filter((x) => x.slot > 0)
    .sort((a, b) => a.slot - b.slot)
    .map((x) => x.song)
}

/** How alike two players' lists are, 0–1 (1 = identical): one minus the normalised footrule distance
 *  over the songs both placed. null when they share fewer than two songs. */
export function similarity(a: BlindPlayer, b: BlindPlayer): number | null {
  const shared = a.slots.map((_, i) => i).filter((i) => a.slots[i] > 0 && b.slots[i] > 0)
  const n = shared.length
  if (n < 2) return null
  // Re-rank within the shared songs so a missed song doesn't skew everything after it.
  const rank = (p: BlindPlayer) => {
    const sorted = [...shared].sort((x, y) => p.slots[x] - p.slots[y])
    return new Map(sorted.map((song, i) => [song, i + 1]))
  }
  const ra = rank(a)
  const rb = rank(b)
  const distance = shared.reduce((sum, song) => sum + Math.abs(ra.get(song)! - rb.get(song)!), 0)
  const max = Math.floor((n * n) / 2)
  return 1 - distance / max
}

export interface PairMatch {
  a: string
  b: string
  similarity: number
}

/** Every pair of players with how alike they are, most alike first. */
export function comparePlayers(picks: BlindPicks): PairMatch[] {
  const players = Object.values(picks)
  const out: PairMatch[] = []
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const s = similarity(players[i], players[j])
      if (s !== null) out.push({ a: players[i].name, b: players[j].name, similarity: s })
    }
  }
  return out.sort((x, y) => y.similarity - x.similarity)
}

/** A player's single closest match, or null with nobody to compare against. */
export function closestMatch(picks: BlindPicks, name: string): { name: string; similarity: number } | null {
  const me = picks[playerKey(name)]
  if (!me) return null
  let best: { name: string; similarity: number } | null = null
  for (const other of Object.values(picks)) {
    if (other === me) continue
    const s = similarity(me, other)
    if (s !== null && (!best || s > best.similarity)) best = { name: other.name, similarity: s }
  }
  return best
}

/** The player least like everyone else (lowest average similarity), if there are at least three. */
export function mostUnique(picks: BlindPicks): { name: string; similarity: number } | null {
  const players = Object.values(picks)
  if (players.length < 3) return null
  let worst: { name: string; similarity: number } | null = null
  for (const p of players) {
    const scores = players.filter((o) => o !== p).map((o) => similarity(p, o)).filter((s): s is number => s !== null)
    if (scores.length === 0) continue
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    if (!worst || avg < worst.similarity) worst = { name: p.name, similarity: avg }
  }
  return worst
}

export interface SongStat {
  song: number
  /** Average slot across players (1 = everyone's favorite). */
  mean: number
  /** Standard deviation of the slots — high means the group split on it. */
  spread: number
  count: number
}

export function songStats(picks: BlindPicks, total: number): SongStat[] {
  const players = Object.values(picks)
  const stats: SongStat[] = []
  for (let song = 0; song < total; song++) {
    const slots = players.map((p) => p.slots[song]).filter((s) => s > 0)
    if (slots.length === 0) continue
    const mean = slots.reduce((a, b) => a + b, 0) / slots.length
    const variance = slots.reduce((a, s) => a + (s - mean) ** 2, 0) / slots.length
    stats.push({ song, mean, spread: Math.sqrt(variance), count: slots.length })
  }
  return stats
}
