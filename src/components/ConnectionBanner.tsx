import { useEffect, useState } from 'react'
import type { SocketStatus } from '../lib/buzzer/buzzer-socket'
import { withIcons } from '../lib/with-icons'

const SLOW_MS = 8000

// Shown only while the live link to the room is down or not yet up, so a dropped connection
// is stated plainly instead of the screen just going quiet. If it stays down for a while, say
// what's probably wrong rather than leaving "Connecting…" up forever.
export default function ConnectionBanner({ status, className = '' }: { status: SocketStatus; className?: string }) {
  // Which status the slow timer fired for — derived below so a status change resets it without a sync setState.
  const [slowFor, setSlowFor] = useState<SocketStatus | null>(null)
  useEffect(() => {
    if (status === 'open') return
    const t = setTimeout(() => setSlowFor(status), SLOW_MS)
    return () => {
      clearTimeout(t)
      setSlowFor(null)
    }
  }, [status])
  const slow = slowFor === status

  if (status === 'open') return null
  const reconnecting = status === 'reconnecting'
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
        reconnecting || slow ? 'border-scoreboard-500/60 bg-scoreboard-500/15 text-scoreboard-500' : 'border-arena-600 bg-arena-800 text-slate-300'
      } ${className}`}
    >
      {slow
        ? withIcons("⚠️ Can't reach the room server — check your internet connection (still trying)…")
        : reconnecting
          ? withIcons('⚠️ Connection lost — reconnecting…')
          : 'Connecting…'}
    </div>
  )
}
