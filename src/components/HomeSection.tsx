import { useState, type ReactNode } from 'react'

const KEY = 'gts.home.sections.v1'

function readClosed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

// A Home list (games, tier lists, seasons…) with a heading that collapses it, showing the item
// count — so a long library doesn't force scrolling past everything to reach what you want. The
// open/closed choice is remembered. A search in progress keeps sections open (`forceOpen`) so
// matches are never hidden.
export default function HomeSection({ id, title, count, forceOpen, children }: { id: string; title: string; count: number; forceOpen?: boolean; children: ReactNode }) {
  const [closed, setClosed] = useState(() => readClosed()[id] ?? false)
  const toggle = () => {
    const next = !closed
    setClosed(next)
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...readClosed(), [id]: next }))
    } catch {
      // Best-effort only.
    }
  }
  const open = forceOpen || !closed
  return (
    <div className="mt-16">
      <h2 className="mb-4">
        <button
          onClick={toggle}
          aria-expanded={open}
          className="flex w-full items-center gap-3 text-left font-display text-2xl tracking-wide text-slate-300 hover:text-white"
        >
          <span>{title}</span>
          <span className="rounded-full bg-arena-700 px-2.5 py-0.5 font-sans text-xs font-semibold tracking-normal text-slate-300">{count}</span>
          <span className="ml-auto text-base text-slate-500" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
        </button>
      </h2>
      {open && children}
    </div>
  )
}
