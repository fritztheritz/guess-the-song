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

const ARENA_FX_KEY = 'gts.arenaFx.v1'

/** Court & crowd flourishes — sneaker squeaks, net swishes, the lock-in horn and the crowd roar (default on).
 *  Separate from the main sound switch so a host can keep buzzers but drop the extras. */
export function getArenaFx(): boolean {
  try {
    return localStorage.getItem(ARENA_FX_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setArenaFx(on: boolean): void {
  try {
    if (on) localStorage.removeItem(ARENA_FX_KEY)
    else localStorage.setItem(ARENA_FX_KEY, 'off')
  } catch {
    // Best-effort only.
  }
}

const STICKERS_KEY = 'gts.stickers.v1'

/** Host-side switch for trash-talk stickers from phones (default on; only matters when Crowd Reactions is on). */
export function getStickersOn(): boolean {
  try {
    return localStorage.getItem(STICKERS_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setStickersOn(on: boolean): void {
  try {
    if (on) localStorage.removeItem(STICKERS_KEY)
    else localStorage.setItem(STICKERS_KEY, 'off')
  } catch {
    // Best-effort only.
  }
}
