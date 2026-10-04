import type { SocketStatus } from '../lib/buzzer/buzzer-socket'

// Shown only while the live link to the room is down or not yet up, so a dropped connection
// is stated plainly instead of the screen just going quiet.
export default function ConnectionBanner({ status, className = '' }: { status: SocketStatus; className?: string }) {
  if (status === 'open') return null
  const reconnecting = status === 'reconnecting'
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${
        reconnecting ? 'border-scoreboard-500/60 bg-scoreboard-500/15 text-scoreboard-500' : 'border-arena-600 bg-arena-800 text-slate-300'
      } ${className}`}
    >
      {reconnecting ? '⚠️ Connection lost — reconnecting…' : 'Connecting…'}
    </div>
  )
}
