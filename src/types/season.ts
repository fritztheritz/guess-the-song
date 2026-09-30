// Deliberately lighter than Tournament: a Season is just a saved name plus a tag. Standings
// are computed live from every completed Game/PopularityGame/TimelineGame that carries the
// tag (see lib/tournament-standings.ts, reused as-is), so adding a week to the season is just
// tagging that week's game the same way — no per-game "add to season" bookkeeping to repeat
// every time, unlike Tournament's explicit gameIds list.
export interface Season {
  id: string
  name: string
  tag: string
  createdAt: string
  updatedAt: string
}

export function createEmptySeason(name: string, tag: string): Season {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), name, tag, createdAt: now, updatedAt: now }
}

export function duplicateSeason(season: Season): Season {
  const now = new Date().toISOString()
  return { ...season, id: crypto.randomUUID(), name: `${season.name} (Copy)`, createdAt: now, updatedAt: now }
}
