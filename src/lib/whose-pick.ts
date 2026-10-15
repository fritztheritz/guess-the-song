import { playerKey } from './blind-rank'

// "Whose Pick Is This?" — everyone secretly claims a few favourites from a shared pool (no two players can
// claim the same song), then the songs play in random order and the room guesses which friend picked each one.
// Pure rules live here; the host page and phone screens just drive them.

export const DEFAULT_PICKS = 3
export const MIN_PICKS = 1
export const MAX_PICKS = 5
/** Fewest claimed songs / pickers for a game worth starting. */
export const MIN_SONGS_TO_START = 4
export const MIN_PICKERS = 2
/** The pool phones are shown is capped so a state sync stays small. */
export const MAX_POOL = 300

export interface Owner {
  /** playerKey(name): who this is, case-insensitively. */
  key: string
  name: string
}

/** songId → who claimed it. A song has at most one owner. */
export type Claims = Record<string, Owner>

export type PickOutcome = 'claimed' | 'released' | 'taken' | 'limit'

/** Taps a song: claims it if it's free and the player has picks left, releases it if it's theirs. */
export function togglePick(claims: Claims, songId: string, player: { name: string }, limit: number): { claims: Claims; outcome: PickOutcome } {
  const key = playerKey(player.name)
  const owner = claims[songId]
  if (owner) {
    if (owner.key !== key) return { claims, outcome: 'taken' }
    const next = { ...claims }
    delete next[songId]
    return { claims: next, outcome: 'released' }
  }
  if (picksOf(claims, key).length >= limit) return { claims, outcome: 'limit' }
  return { claims: { ...claims, [songId]: { key, name: player.name.trim() } }, outcome: 'claimed' }
}

export const picksOf = (claims: Claims, key: string): string[] => Object.keys(claims).filter((id) => claims[id].key === key)

/** A short stable tag for a player, safe to broadcast in place of their name. */
export function ownerTag(name: string): string {
  let h = 2166136261
  for (const ch of playerKey(name)) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export const claimedTags = (claims: Claims): Record<string, string> => Object.fromEntries(Object.entries(claims).map(([id, o]) => [id, ownerTag(o.name)]))

/** Everyone who has claimed at least one song, in a stable order (the phone's "who is it?" buttons). */
export function pickers(claims: Claims): Array<Owner & { count: number }> {
  const byKey = new Map<string, Owner & { count: number }>()
  for (const o of Object.values(claims)) {
    const seen = byKey.get(o.key)
    if (seen) seen.count += 1
    else byKey.set(o.key, { ...o, count: 1 })
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function canStart(claims: Claims): boolean {
  return Object.keys(claims).length >= MIN_SONGS_TO_START && pickers(claims).length >= MIN_PICKERS
}

/** The claimed songs in a random order. */
export function buildOrder(claims: Claims, rng: () => number = Math.random): string[] {
  const ids = Object.keys(claims)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids
}

export interface Guess {
  key: string
  name: string
  teamId: string
  /** The picker they named. */
  guessKey: string
}

export interface SongScore {
  right: Guess[]
  wrong: Guess[]
  /** Wrong guesses that actually fooled someone from another team (those earn the owner's team a point). */
  fooled: Guess[]
  gains: Record<string, number>
}

/** A right guess scores 1 for the guesser's team; each wrong guess from another team scores 1 for the owner's
 *  team (they fooled the room). Teammates guessing wrong don't count — that's not fooling anyone. */
export function scoreSong(owner: { key: string; teamId?: string }, guesses: Guess[]): SongScore {
  const right: Guess[] = []
  const wrong: Guess[] = []
  const fooled: Guess[] = []
  const gains: Record<string, number> = {}
  const add = (teamId: string) => (gains[teamId] = (gains[teamId] ?? 0) + 1)
  for (const g of guesses) {
    if (g.key === owner.key) continue
    if (g.guessKey === owner.key) {
      right.push(g)
      add(g.teamId)
    } else {
      wrong.push(g)
      if (owner.teamId && g.teamId !== owner.teamId) {
        fooled.push(g)
        add(owner.teamId)
      }
    }
  }
  return { right, wrong, fooled, gains }
}

export interface Tally {
  name: string
  correct: number
  /** Guesses of theirs that were wrong. */
  wrong: number
  /** Times their pick fooled someone from another team. */
  fooled: number
}

export type Tallies = Record<string, Tally>

export function addToTallies(tallies: Tallies, owner: Owner, score: SongScore): Tallies {
  const next: Tallies = { ...tallies }
  const touch = (key: string, name: string): Tally => (next[key] = { ...(next[key] ?? { name, correct: 0, wrong: 0, fooled: 0 }) })
  for (const g of score.right) touch(g.key, g.name).correct += 1
  for (const g of score.wrong) touch(g.key, g.name).wrong += 1
  if (score.fooled.length > 0) touch(owner.key, owner.name).fooled += score.fooled.length
  return next
}

/** The best detective (most right guesses) and master of disguise (most people fooled), if anyone earned it. */
export function awardsFrom(tallies: Tallies): { detective: Tally | null; disguise: Tally | null } {
  const all = Object.values(tallies)
  const best = (pick: (t: Tally) => number): Tally | null => {
    const top = all.reduce<Tally | null>((a, t) => (pick(t) > (a ? pick(a) : 0) ? t : a), null)
    return top && pick(top) > 0 ? top : null
  }
  return { detective: best((t) => t.correct), disguise: best((t) => t.fooled) }
}
