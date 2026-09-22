import type { Game } from '../types'

// Full-library backup file — distinct from the per-game shareable link (game-share.ts),
// which encodes into a URL and is meant for handing one game to someone else. This is a
// plain downloadable JSON file meant for the same person to restore their own library
// (e.g. after clearing browser data or moving to a new machine).
const FORMAT = 'guess-the-song-backup'
const VERSION = 1

interface BackupFile {
  format: typeof FORMAT
  version: number
  exportedAt: string
  games: Game[]
}

export function buildBackupFile(games: Game[]): string {
  const backup: BackupFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    games,
  }
  return JSON.stringify(backup, null, 2)
}

export function downloadBackupFile(games: Game[]) {
  const json = buildBackupFile(games)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().slice(0, 10)

  const a = document.createElement('a')
  a.href = url
  a.download = `guess-the-song-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export class BackupFileError extends Error {}

export function parseBackupFile(text: string): Game[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupFileError("That file isn't valid JSON.")
  }

  if (!data || typeof data !== 'object' || !Array.isArray((data as BackupFile).games)) {
    throw new BackupFileError("That doesn't look like a Guess the Track backup file.")
  }

  return (data as BackupFile).games
}
