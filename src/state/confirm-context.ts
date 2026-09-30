import { createContext, useContext } from 'react'

export interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for destructive actions (delete, reset) vs. the default hardwood accent. */
  danger?: boolean
}

export interface ConfirmState extends ConfirmOptions {
  message: string
}

export type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)

// Promise-based replacement for window.confirm() so destructive actions everywhere in the
// app (game/tier-list delete, round remove, exit presentation, reset flags) get a styled
// dialog that matches the theme instead of the browser's unstyled native one.
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
