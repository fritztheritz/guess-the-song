// Draft mode: a persistent song pool (the "board") that multiple draft sessions can run
// against. A song picked in ANY session under a board is unavailable to every other session
// under that same board, past or future — creating a brand new board is the only way to get
// a fresh pool. Deliberately separate from the Game/GameMode system: there's no "correct
// answer" being guessed here, it's closer in spirit to a tier list (curate, then rank).

export interface DraftPoolSong {
  id: string
  title: string
  artist: string
  artworkUrl?: string
  source: 'soundcloud' | 'spotify'
  soundcloudTrackId?: string
  soundcloudUrn?: string
  soundcloudUrl?: string
  soundcloudSecretToken?: string
  spotifyTrackId?: string
  spotifyUri?: string
  spotifyUrl?: string
  /** Set once picked in any session under this board. Absent = still available. */
  takenBySessionId?: string
  takenByDrafterId?: string
}

/** A snapshot, not a live reference — drafters are copied in from a saved team preset (or
 *  typed fresh) at session-creation time, same one-time-copy convention as every other
 *  import in this app, so a session's roster stays stable even if the source team changes. */
export interface Drafter {
  id: string
  name: string
  color: string
  avatar?: string
}

export interface DraftPick {
  songId: string
  drafterId: string
  /** 1-indexed. */
  round: number
}

/** One drafter's end-of-draft ballot — ranks every OTHER drafter's final roster best (index 0)
 *  to worst. Never includes its own drafterId. */
export interface DraftRanking {
  drafterId: string
  rankedDrafterIds: string[]
}

export type DraftSessionPhase = 'drafting' | 'ranking' | 'complete'

export interface DraftSession {
  id: string
  name: string
  drafters: Drafter[]
  picksPerDrafter: number
  picks: DraftPick[]
  phase: DraftSessionPhase
  rankings: DraftRanking[]
  createdAt: string
  completedAt?: string
}

export interface DraftBoard {
  id: string
  name: string
  songPool: DraftPoolSong[]
  sessions: DraftSession[]
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export function createEmptyDraftBoard(name: string): DraftBoard {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), name, songPool: [], sessions: [], createdAt: now, updatedAt: now }
}

export function createDraftSession(name: string, drafters: Drafter[], picksPerDrafter: number): DraftSession {
  return {
    id: crypto.randomUUID(),
    name,
    drafters,
    picksPerDrafter,
    picks: [],
    phase: 'drafting',
    rankings: [],
    createdAt: new Date().toISOString(),
  }
}

/** Flat pick-order as a sequence of drafter indices (0-indexed into session.drafters), length
 *  drafterCount * rounds. Whose turn it is = order[picks.length]. Standard snake: round 0 goes
 *  0..N-1, round 1 reverses to N-1..0, and so on. */
export function snakeOrder(drafterCount: number, rounds: number): number[] {
  const order: number[] = []
  for (let round = 0; round < rounds; round++) {
    const indices = Array.from({ length: drafterCount }, (_, i) => i)
    if (round % 2 === 1) indices.reverse()
    order.push(...indices)
  }
  return order
}

export interface DraftStanding {
  drafterId: string
  name: string
  color: string
  avatar?: string
  points: number
}

/** Points-by-rank-position, summed across every submitted ballot: 1st place on a ballot is
 *  worth as many points as there are ranked candidates on it, down to 1 point for last. */
export function computeDraftStandings(session: DraftSession): DraftStanding[] {
  const points = new Map<string, number>(session.drafters.map((d) => [d.id, 0]))
  for (const ballot of session.rankings) {
    ballot.rankedDrafterIds.forEach((id, i) => {
      const score = ballot.rankedDrafterIds.length - i
      points.set(id, (points.get(id) ?? 0) + score)
    })
  }
  return session.drafters
    .map((d) => ({ drafterId: d.id, name: d.name, color: d.color, avatar: d.avatar, points: points.get(d.id) ?? 0 }))
    .sort((a, b) => b.points - a.points)
}
