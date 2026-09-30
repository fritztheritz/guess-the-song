import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import DialogShell from '../components/ui/DialogShell'
import Button from '../components/ui/Button'
import { ConfirmContext, type ConfirmFn, type ConfirmState } from './confirm-context'

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
        <DialogShell onClose={() => settle(false)} zIndex="z-[100]" role="alertdialog">
          {state.title && <h2 className="mb-2 font-display text-xl tracking-wide text-hardwood-400">{state.title}</h2>}
          <p className="text-sm text-slate-300">{state.message}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" size="sm" autoFocus onClick={() => settle(false)}>
              {state.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={state.danger ? 'danger' : 'primary'} size="sm" onClick={() => settle(true)}>
              {state.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </DialogShell>
      )}
    </ConfirmContext.Provider>
  )
}
