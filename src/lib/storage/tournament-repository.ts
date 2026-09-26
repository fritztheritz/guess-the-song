import type { Tournament } from '../../types/tournament'

// Same storage pattern as game-repository.ts/tierlist-repository.ts, own key.
const STORAGE_KEY = 'gts.tournaments.v1'

function readAll(): Record<string, Tournament> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, Tournament>
  } catch {
    return {}
  }
}

function writeAll(tournaments: Record<string, Tournament>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tournaments))
}

export function listTournaments(): Tournament[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getTournament(id: string): Tournament | null {
  return readAll()[id] ?? null
}

export function saveTournament(tournament: Tournament): Tournament {
  const all = readAll()
  const next: Tournament = { ...tournament, updatedAt: new Date().toISOString() }
  all[tournament.id] = next
  writeAll(all)
  return next
}

export function deleteTournament(id: string) {
  const all = readAll()
  delete all[id]
  writeAll(all)
}

export function exportAllTournaments(): Tournament[] {
  return listTournaments()
}

/** Restores tournaments from a backup, keyed by id — same overwrite-by-id semantics as importGames. */
export function importTournaments(tournaments: Tournament[]): number {
  const existing = readAll()
  for (const tournament of tournaments) {
    existing[tournament.id] = tournament
  }
  writeAll(existing)
  return tournaments.length
}
