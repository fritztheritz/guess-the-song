// Deliberately lightweight: a tournament is just a named, ordered sequence of existing
// Game ids plus a running leaderboard computed from them (see lib/tournament-standings.ts)
// — no bracket/seeding structure, no separate contestant roster. Standings are aggregated
// by matching team name across games, so results only merge for teams named consistently
// from one game to the next.
export interface Tournament {
  id: string
  name: string
  gameIds: string[]
  createdAt: string
  updatedAt: string
  tags?: string[]
}

export function createEmptyTournament(name: string): Tournament {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), name, gameIds: [], createdAt: now, updatedAt: now }
}

export function duplicateTournament(tournament: Tournament): Tournament {
  const now = new Date().toISOString()
  return { ...tournament, id: crypto.randomUUID(), name: `${tournament.name} (Copy)`, createdAt: now, updatedAt: now }
}
