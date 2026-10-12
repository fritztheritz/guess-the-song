// Small per-device preferences that aren't feature flags. Stored in localStorage; every read/write is
// guarded so a blocked or full store just falls back to the default.

const KEEP_AWAKE_KEY = 'gts.keepAwake.v1'

/** Keep the screen on during games (default on). Turn off to save battery on a phone. */
export function getKeepAwake(): boolean {
  try {
    return localStorage.getItem(KEEP_AWAKE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setKeepAwake(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEEP_AWAKE_KEY)
    else localStorage.setItem(KEEP_AWAKE_KEY, 'off')
  } catch {
    // Best-effort only.
  }
}
