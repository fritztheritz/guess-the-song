import type { ReactNode } from 'react'

// The full-screen picker/import modals (ImportSoundCloudModal, ImportSpotifyModal,
// NewDraftSessionModal, AnswerKeyModal, GamePickerModal, ImportFromTierListModal,
// TierListPickerModal) had all converged on this exact shell — overlay, rounded-2xl card,
// header with title/subtitle/close — independently, byte-for-byte. Doesn't close on backdrop
// click: these all hold in-progress selections a stray click shouldn't discard.
export default function ModalShell({
  title,
  titleClassName = 'text-2xl',
  subtitle,
  maxWidth = 'max-w-lg',
  bodyHeight = 'max-h-[85vh]',
  onClose,
  children,
}: {
  title: string
  /** Full literal Tailwind class(es), e.g. "text-3xl" — the couple of modals with a longer title need more room. */
  titleClassName?: string
  subtitle?: ReactNode
  /** Full literal Tailwind class, e.g. "max-w-5xl" — passed straight through so Tailwind's scanner sees it. */
  maxWidth?: string
  /** Full literal Tailwind class controlling the card's height/overflow, e.g. "h-[90vh]". */
  bodyHeight?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`flex ${bodyHeight} w-full ${maxWidth} flex-col overflow-hidden rounded-2xl border border-arena-600 bg-arena-900 shadow-2xl`}>
        <div className="flex items-start justify-between border-b border-arena-700 px-6 py-4">
          <div>
            <h2 className={`font-display tracking-wide text-hardwood-400 ${titleClassName}`}>{title}</h2>
            {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-arena-700 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
