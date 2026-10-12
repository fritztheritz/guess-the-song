import { isBuzzerConfigured, vaultUrl } from './buzzer/config'

// Optional cloud copy of the library (the same JSON as "Export everything"), kept on the Worker under
// a long random code. No accounts: the code is the key, so it's shown once to be written down and
// kept in this browser so "Back up again" reuses it.

const CODE_KEY = 'gts.cloudbackup.v1'
// No 0/1/O/I — read and typed by people. 29 symbols × 20 characters ≈ 97 bits.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.replace('L', '')
const CODE_LENGTH = 20

export const CLOUD_CODE_PATTERN = /^[A-Z2-9]{16,32}$/

export interface SavedCloudBackup {
  code: string
  /** ISO time of the last successful upload from this browser. */
  at: string
}

export class CloudBackupError extends Error {}

export const isCloudBackupAvailable = isBuzzerConfigured

export function generateBackupCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/** What a person types back in: tolerant of case, spaces and dashes. */
export function normalizeBackupCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '')
}

/** Groups a code for reading aloud / writing down: ABCD-EFGH-... */
export function formatBackupCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code
}

export function loadSavedCloudBackup(): SavedCloudBackup | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CODE_KEY) ?? 'null') as SavedCloudBackup | null
    return parsed && CLOUD_CODE_PATTERN.test(parsed.code) ? parsed : null
  } catch {
    return null
  }
}

function saveCloudBackup(entry: SavedCloudBackup) {
  try {
    localStorage.setItem(CODE_KEY, JSON.stringify(entry))
  } catch {
    // Best-effort — the code was shown to the person already.
  }
}

async function request(code: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(vaultUrl(code), init)
  } catch {
    throw new CloudBackupError("Couldn't reach the backup service — check your connection and try again.")
  }
}

/** Uploads `json` under `code` (a new one if omitted), remembers it, and returns the entry. */
export async function uploadCloudBackup(json: string, code = loadSavedCloudBackup()?.code ?? generateBackupCode()): Promise<SavedCloudBackup> {
  const res = await request(code, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json })
  if (res.status === 413) throw new CloudBackupError('That library is too big for cloud backup — use "Export everything" instead.')
  if (!res.ok) throw new CloudBackupError('The backup service refused that upload.')
  const { updatedAt } = (await res.json()) as { updatedAt: string }
  const entry = { code, at: updatedAt }
  saveCloudBackup(entry)
  return entry
}

/** The backup text stored under `code`. Throws CloudBackupError with a plain message when it's missing. */
export async function downloadCloudBackup(code: string): Promise<{ backup: string; updatedAt: string }> {
  if (!CLOUD_CODE_PATTERN.test(code)) throw new CloudBackupError("That doesn't look like a backup code.")
  const res = await request(code)
  if (res.status === 404) throw new CloudBackupError('No backup found for that code (it may have expired after 90 days).')
  if (!res.ok) throw new CloudBackupError('The backup service refused that request.')
  const body = (await res.json()) as { backup: string; updatedAt: string }
  saveCloudBackup({ code, at: body.updatedAt })
  return body
}
