const KEY = 'gts.hostTools.open.v1'

export function readToolsOpen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function writeToolsOpen(open: boolean) {
  try {
    localStorage.setItem(KEY, open ? '1' : '0')
  } catch {
    // Best-effort only.
  }
}
