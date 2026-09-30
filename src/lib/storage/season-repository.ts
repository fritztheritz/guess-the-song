import type { Season } from '../../types/season'

// Same storage pattern as tournament-repository.ts/tierlist-repository.ts, own key.
const STORAGE_KEY = 'gts.seasons.v1'

function readAll(): Record<string, Season> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, Season>
  } catch {
    return {}
  }
}

function writeAll(seasons: Record<string, Season>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seasons))
}

export function listSeasons(): Season[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getSeason(id: string): Season | null {
  return readAll()[id] ?? null
}

export function saveSeason(season: Season): Season {
  const all = readAll()
  const next: Season = { ...season, updatedAt: new Date().toISOString() }
  all[season.id] = next
  writeAll(all)
  return next
}

export function deleteSeason(id: string) {
  const all = readAll()
  delete all[id]
  writeAll(all)
}

export function exportAllSeasons(): Season[] {
  return listSeasons()
}

/** Restores seasons from a backup, keyed by id — same overwrite-by-id semantics as importGames. */
export function importSeasons(seasons: Season[]): number {
  const existing = readAll()
  for (const season of seasons) {
    existing[season.id] = season
  }
  writeAll(existing)
  return seasons.length
}
