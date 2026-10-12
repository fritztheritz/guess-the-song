import { useEffect } from 'react'

// Keeps the screen on while `active` — a phone that locks mid-game drops its connection (and a TV
// that sleeps mid-song ruins the show). The browser releases the lock whenever the tab is hidden,
// so it's asked for again when the tab comes back. Silently does nothing where the Wake Lock API
// isn't available or the request is refused (low battery, no user gesture yet).
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request('screen')
        if (cancelled) void next.release()
        else lock = next
      } catch {
        // Refused or unsupported right now — try again on the next visibility change.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!lock || lock.released)) void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [active])
}
