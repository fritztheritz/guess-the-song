import type { TimelineGame } from '../../types/timeline'

// Same storage pattern as popularity-repository.ts, kept in its own key.
const STORAGE_KEY = 'gts.timeline.v1'

function readAll(): Record<string, TimelineGame> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, TimelineGame>
  } catch {
    return {}
  }
}

function writeAll(games: Record<string, TimelineGame>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games))
}

export function listTimelineGames(): TimelineGame[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getTimelineGame(id: string): TimelineGame | null {
  return readAll()[id] ?? null
}

export function saveTimelineGame(game: TimelineGame): TimelineGame {
  const all = readAll()
  const next: TimelineGame = { ...game, updatedAt: new Date().toISOString() }
  all[game.id] = next
  writeAll(all)
  return next
}

export function deleteTimelineGame(id: string) {
  const all = readAll()
  delete all[id]
  writeAll(all)
}

export function exportAllTimelineGames(): TimelineGame[] {
  return listTimelineGames()
}

/** Restores games from a backup, keyed by id — same overwrite-by-id semantics as importPopularityGames. */
export function importTimelineGames(games: TimelineGame[]): number {
  const existing = readAll()
  for (const game of games) {
    existing[game.id] = game
  }
  writeAll(existing)
  return games.length
}
