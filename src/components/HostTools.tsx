import type { ReactNode } from 'react'

interface Props {
  open: boolean
  onToggle: () => void
  /** Short status shown on the collapsed bar (e.g. "Double armed · 1 ejected"). */
  summary?: string
  children: ReactNode
}

// The host's optional controls (power-ups, ref's call, soundboard) live in one collapsible tray
// so the main area stays on the clue, the reveal and the next button. Open/closed is owned by
// the host screen (and remembered there) so the toolbar's soundboard button can open it too.
export default function HostTools({ open, onToggle, summary, children }: Props) {
  return (
    <div className="relative z-10 mb-3 w-full max-w-xl rounded-xl border border-arena-700 bg-arena-900/60">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-2 text-xs uppercase tracking-widest text-slate-400 hover:text-slate-200"
      >
        <span>🧰 Host tools{summary ? <span className="ml-2 normal-case tracking-normal text-scoreboard-amber">{summary}</span> : null}</span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="space-y-3 border-t border-arena-700 px-3 py-3">{children}</div>}
    </div>
  )
}
