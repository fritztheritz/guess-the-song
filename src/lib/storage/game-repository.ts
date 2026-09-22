import type { Game } from '../../types'

// This app deploys as a static site (no backend), so games persist in the
// browser's localStorage rather than a shared database (spec §30 describes the
// Postgres shape this would take with a backend — same fields, different store).
const STORAGE_KEY = 'gts.games.v1'

function readAll(): Record<string, Game> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, Game>
  } catch {
    return {}
  }
}

function writeAll(games: Record<string, Game>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games))
}

export function listGames(): Game[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getGame(id: string): Game | null {
  return readAll()[id] ?? null
}

export function saveGame(game: Game): Game {
  const games = readAll()
  const next: Game = { ...game, updatedAt: new Date().toISOString() }
  games[game.id] = next
  writeAll(games)
  return next
}

export function deleteGame(id: string) {
  const games = readAll()
  delete games[id]
  writeAll(games)
}

export function exportAllGames(): Game[] {
  return listGames()
}

/**
 * Restores games from a backup, keyed by id — a game already present with the same id is
 * overwritten by the backup's version. This is deliberately different from importing a
 * single shared game link, which always assigns a fresh id so it never clobbers anything;
 * a full-library restore is expected to reproduce exactly what was backed up.
 */
export function importGames(games: Game[]): number {
  const existing = readAll()
  for (const game of games) {
    existing[game.id] = game
  }
  writeAll(existing)
  return games.length
}
