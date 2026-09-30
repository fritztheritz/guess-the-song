import { createContext, useContext } from 'react'

export interface ToastItem {
  id: string
  message: string
  tone: 'default' | 'danger'
}

export type ToastFn = (message: string, tone?: ToastItem['tone']) => void

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
