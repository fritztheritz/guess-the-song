import type { TierList } from '../../types/tierlist'

// Same storage pattern as game-repository.ts, kept in its own key so tier lists are
// independent of the games library (backup/restore, export, etc. all separate for now).
const STORAGE_KEY = 'gts.tierlists.v1'

function readAll(): Record<string, TierList> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, TierList>
  } catch {
    return {}
  }
}

function writeAll(lists: Record<string, TierList>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists))
}

export function listTierLists(): TierList[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getTierList(id: string): TierList | null {
  return readAll()[id] ?? null
}

export function saveTierList(list: TierList): TierList {
  const all = readAll()
  const next: TierList = { ...list, updatedAt: new Date().toISOString() }
  all[list.id] = next
  writeAll(all)
  return next
}

export function deleteTierList(id: string) {
  const all = readAll()
  delete all[id]
  writeAll(all)
}
