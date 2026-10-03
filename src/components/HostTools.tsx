import { useState, type ReactNode } from 'react'

const KEY = 'gts.hostTools.open.v1'

function readOpen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

interface Props {
  /** Short status shown on the collapsed bar (e.g. "Double armed · 1 ejected"). */
  summary?: string
  children: ReactNode
}

// The host's optional controls (power-ups, ref's call) live in one collapsible drawer so the
// main area stays on the clue, the reveal and the next button. The open/closed choice sticks
// across possessions and sessions.
export default function HostTools({ summary, children }: Props) {
  const [open, setOpen] = useState(readOpen)
  const toggle = () => {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch {
      // Best-effort only.
    }
  }
  return (
    <div className="relative z-10 mb-3 w-full max-w-xl rounded-xl border border-arena-700 bg-arena-900/60">
      <button
        onClick={toggle}
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
