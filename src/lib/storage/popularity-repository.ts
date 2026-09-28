import type { PopularityGame } from '../../types/popularity'

// Same storage pattern as tierlist-repository.ts/game-repository.ts, kept in its own key.
const STORAGE_KEY = 'gts.popularity.v1'

function readAll(): Record<string, PopularityGame> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, PopularityGame>
  } catch {
    return {}
  }
}

function writeAll(games: Record<string, PopularityGame>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games))
}

export function listPopularityGames(): PopularityGame[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getPopularityGame(id: string): PopularityGame | null {
  return readAll()[id] ?? null
}

export function savePopularityGame(game: PopularityGame): PopularityGame {
  const all = readAll()
  const next: PopularityGame = { ...game, updatedAt: new Date().toISOString() }
  all[game.id] = next
  writeAll(all)
  return next
}

export function deletePopularityGame(id: string) {
  const all = readAll()
  delete all[id]
  writeAll(all)
}
