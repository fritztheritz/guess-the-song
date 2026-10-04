import type { ReactNode } from 'react'
import { useOnline } from '../../lib/use-online'

// The one way a failed load/import is shown: what went wrong in plain words, a hint when the cause
// is likely the connection, and what to do next (retry / dismiss) — instead of a bare red line.
export default function ErrorState({
  message,
  onRetry,
  onDismiss,
  className = '',
  children,
}: {
  message: string
  onRetry?: () => void
  onDismiss?: () => void
  className?: string
  children?: ReactNode
}) {
  const online = useOnline()
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-lg border border-scoreboard-500/40 bg-scoreboard-500/10 px-4 py-3 text-sm ${className}`}>
      <span className="text-lg" aria-hidden>
        {online ? '⚠️' : '📡'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-scoreboard-500">{message}</div>
        {!online && <div className="mt-0.5 text-xs text-slate-400">You appear to be offline — reconnect and try again.</div>}
        {children}
        {(onRetry || onDismiss) && (
          <div className="mt-2 flex gap-3 text-xs">
            {onRetry && (
              <button onClick={onRetry} className="font-semibold text-slate-200 underline hover:text-white">
                Try again
              </button>
            )}
            {onDismiss && (
              <button onClick={onDismiss} className="text-slate-400 underline hover:text-slate-200">
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
