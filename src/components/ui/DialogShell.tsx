import type { ReactNode } from 'react'

// The compact centered-card shell for short-form dialogs (confirm prompts, single-field
// modals like "name the playlist") — distinct from ModalShell's larger scrollable-picker shape.
// Closes on backdrop click by default, since these hold little enough state that losing it to
// a stray click is a minor annoyance rather than the data-loss risk a big import modal has.
export default function DialogShell({
  onClose,
  closeOnBackdrop = true,
  maxWidth = 'max-w-sm',
  zIndex = 'z-50',
  role,
  children,
}: {
  onClose: () => void
  closeOnBackdrop?: boolean
  /** Full literal Tailwind class, e.g. "max-w-md" for a slightly roomier dialog. */
  maxWidth?: string
  /** Full literal Tailwind class — bump above "z-50" (ModalShell's layer) for a dialog that
   *  must sit on top of an already-open modal, e.g. the app-wide confirm prompt. */
  zIndex?: string
  role?: string
  children: ReactNode
}) {
  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-black/70 p-4`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        role={role}
        aria-modal={role ? true : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${maxWidth} animate-pop-in rounded-2xl border border-arena-600 bg-arena-900 p-6 shadow-2xl`}
      >
        {children}
      </div>
    </div>
  )
}
