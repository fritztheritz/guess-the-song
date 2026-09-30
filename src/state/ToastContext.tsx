import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastFn, type ToastItem } from './toast-context'

const DEFAULT_DURATION_MS = 2600
// Exported so callers that need to match a toast's own lifetime — e.g. a delete that only
// really commits once its "Undo" toast has expired — can read the same number back rather
// than hardcoding a second copy of it. See useUndoableDelete.
export const ACTION_DURATION_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback<ToastFn>(
    (message, options = {}) => {
      const id = crypto.randomUUID()
      const duration = options.durationMs ?? (options.action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS)
      setToasts((prev) => [...prev, { id, message, ...options }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      )
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[110] flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-pop-in pointer-events-auto flex items-center gap-3 rounded-full py-2 pl-4 text-sm font-medium shadow-xl ${
              t.action ? 'pr-2' : 'pr-4'
            } ${t.tone === 'danger' ? 'bg-scoreboard-500 text-arena-950' : 'border border-arena-600 bg-arena-800 text-slate-100'}`}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onAction()
                  dismiss(t.id)
                }}
                className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-white/25"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
