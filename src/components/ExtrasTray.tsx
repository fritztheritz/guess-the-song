import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

// A phone's "extras" — reactions, trash-talk stickers — tucked behind one button that slides a tray up from the
// bottom, so they don't push the buzzer (the thing people are here for) off the screen.
export default function ExtrasTray({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close reactions' : 'Open reactions and stickers'}
        className="fixed bottom-4 right-4 z-40 flex size-14 items-center justify-center rounded-full border-2 border-arena-500 bg-arena-800 text-2xl text-slate-100 shadow-xl"
      >
        <Icon name={open ? 'x' : 'megaphone'} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
          <div role="dialog" aria-label="Reactions and stickers" className="animate-tray-up fixed inset-x-0 bottom-0 z-40 max-h-[80svh] overflow-y-auto rounded-t-2xl border-t-2 border-arena-500 bg-arena-900 px-5 pb-24 pt-5 shadow-2xl">
            <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-4">{children}</div>
          </div>
        </>
      )}
    </>
  )
}
