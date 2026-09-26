import type { Game } from '../types'
import type { TierList } from '../types/tierlist'
import type { Tournament } from '../types/tournament'
import type { DraftBoard } from '../types/draft'

// Full-library backup file — distinct from the per-game shareable link (game-share.ts),
// which encodes into a URL and is meant for handing one game to someone else. This is a
// plain downloadable JSON file meant for the same person to restore their own library
// (e.g. after clearing browser data or moving to a new machine).
const FORMAT = 'guess-the-song-backup'
const VERSION = 4

interface BackupFile {
  format: typeof FORMAT
  version: number
  exportedAt: string
  games: Game[]
  /** Absent on version-1 backups, which predate tier lists. */
  tierLists?: TierList[]
  /** Absent on version-1/2 backups, which predate tournaments. */
  tournaments?: Tournament[]
  /** Absent on version-1/2/3 backups, which predate draft boards. */
  draftBoards?: DraftBoard[]
}

export interface BackupContents {
  games: Game[]
  tierLists: TierList[]
  tournaments: Tournament[]
  draftBoards: DraftBoard[]
}

export function buildBackupFile(games: Game[], tierLists: TierList[], tournaments: Tournament[], draftBoards: DraftBoard[]): string {
  const backup: BackupFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    games,
    tierLists,
    tournaments,
    draftBoards,
  }
  return JSON.stringify(backup, null, 2)
}

export function downloadBackupFile(games: Game[], tierLists: TierList[], tournaments: Tournament[], draftBoards: DraftBoard[]) {
  const json = buildBackupFile(games, tierLists, tournaments, draftBoards)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)

  const a = document.createElement('a')
  a.href = url
  a.download = `buzzer-beats-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export class BackupFileError extends Error {}

export function parseBackupFile(text: string): BackupContents {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupFileError("That file isn't valid JSON.")
  }

  if (!data || typeof data !== 'object' || !Array.isArray((data as BackupFile).games)) {
    throw new BackupFileError("That doesn't look like a Buzzer Beats backup file.")
  }

  const backup = data as BackupFile
  return {
    games: backup.games,
    tierLists: backup.tierLists ?? [],
    tournaments: backup.tournaments ?? [],
    draftBoards: backup.draftBoards ?? [],
  }
}
