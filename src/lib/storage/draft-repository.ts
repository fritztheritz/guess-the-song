import type { DraftBoard } from '../../types/draft'

// Same storage pattern as tournament-repository.ts/tierlist-repository.ts, own key.
const STORAGE_KEY = 'gts.draftboards.v1'

function readAll(): Record<string, DraftBoard> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, DraftBoard>
  } catch {
    return {}
  }
}

function writeAll(boards: Record<string, DraftBoard>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(boards))
}

export function listDraftBoards(): DraftBoard[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getDraftBoard(id: string): DraftBoard | null {
  return readAll()[id] ?? null
}

export function saveDraftBoard(board: DraftBoard): DraftBoard {
  const all = readAll()
  const next: DraftBoard = { ...board, updatedAt: new Date().toISOString() }
  all[board.id] = next
  writeAll(all)
  return next
}

export function deleteDraftBoard(id: string) {
  const all = readAll()
  delete all[id]
  writeAll(all)
}

export function exportAllDraftBoards(): DraftBoard[] {
  return listDraftBoards()
}

/** Restores draft boards from a backup, keyed by id — same overwrite-by-id semantics as importGames. */
export function importDraftBoards(boards: DraftBoard[]): number {
  const existing = readAll()
  for (const board of boards) {
    existing[board.id] = board
  }
  writeAll(existing)
  return boards.length
}
