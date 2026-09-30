import { createContext, useContext } from 'react'

export interface ToastAction {
  label: string
  onAction: () => void
}

export interface ToastOptions {
  tone?: 'default' | 'danger'
  /** How long the toast stays up, ms. Defaults to 2600, or ACTION_DURATION_MS (see
   *  ToastContext.tsx) when an action button is present — long enough to actually read and
   *  tap it. */
  durationMs?: number
  /** A single button rendered on the toast itself, e.g. "Undo" on a delete confirmation —
   *  see useUndoableDelete for the delete-and-offer-to-restore pattern this exists for. */
  action?: ToastAction
}

export interface ToastItem extends ToastOptions {
  id: string
  message: string
}

export type ToastFn = (message: string, options?: ToastOptions) => void

export const ToastContext = createContext<ToastFn | null>(null)

// Lightweight, non-blocking confirmation for actions whose result isn't obvious at a
// glance (a bulk edit applied to rounds not currently open, a delete once the item's
// already gone from the list) — reserved for those cases specifically, not every keystroke
// autosave, to avoid turning into noise.
export function useToast(): ToastFn {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
