import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface ToastItem {
  id: string
  message: string
  tone: 'default' | 'danger'
}

type ToastFn = (message: string, tone?: ToastItem['tone']) => void

const ToastContext = createContext<ToastFn | null>(null)

// Lightweight, non-blocking confirmation for actions whose result isn't obvious at a
// glance (a bulk edit applied to rounds not currently open, a delete once the item's
// already gone from the list) — reserved for those cases specifically, not every keystroke
// autosave, to avoid turning into noise.
export function useToast(): ToastFn {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback<ToastFn>((message, tone = 'default') => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, tone }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[110] flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-pop-in rounded-full px-4 py-2 text-sm font-medium shadow-xl ${
              t.tone === 'danger' ? 'bg-scoreboard-500 text-arena-950' : 'border border-arena-600 bg-arena-800 text-slate-100'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
