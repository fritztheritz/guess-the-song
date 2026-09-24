import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for destructive actions (delete, reset) vs. the default hardwood accent. */
  danger?: boolean
}

interface ConfirmState extends ConfirmOptions {
  message: string
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

// Promise-based replacement for window.confirm() so destructive actions everywhere in the
// app (game/tier-list delete, round remove, exit presentation, reset flags) get a styled
// dialog that matches the theme instead of the browser's unstyled native one.
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((message, options) => {
    setState({ message, ...options })
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  function settle(value: boolean) {
    resolver.current?.(value)
    resolver.current = null
    setState(null)
  }

  useEffect(() => {
    if (!state) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') settle(false)
      if (e.key === 'Enter') settle(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => settle(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm animate-pop-in rounded-2xl border border-arena-600 bg-arena-900 p-6 shadow-2xl"
          >
            {state.title && <h2 className="mb-2 font-display text-xl tracking-wide text-hardwood-400">{state.title}</h2>}
            <p className="text-sm text-slate-300">{state.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                autoFocus
                onClick={() => settle(false)}
                className="rounded-full border border-arena-500 px-4 py-2 text-sm text-slate-300 hover:border-arena-400"
              >
                {state.cancelLabel ?? 'Cancel'}
              </button>
              <button
                onClick={() => settle(true)}
                className={`rounded-full px-4 py-2 text-sm font-semibold text-arena-950 ${
                  state.danger ? 'bg-scoreboard-500 hover:bg-scoreboard-400' : 'bg-hardwood-500 hover:bg-hardwood-400'
                }`}
              >
                {state.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
