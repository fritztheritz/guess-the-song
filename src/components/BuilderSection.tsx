import { useState, type ReactNode } from 'react'

const KEY = 'gts.builder.sections.v1'

function readClosed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

interface Props {
  id: string
  title: string
  /** One-line state shown while collapsed (e.g. "2 teams", "20s"). */
  summary?: string
  /** Collapsed the first time it's seen. */
  defaultClosed?: boolean
  children: ReactNode
}

// A collapsible group in the builder's sidebar — the long list of settings stays scannable, and
// which groups you keep open is remembered between visits.
export default function BuilderSection({ id, title, summary, defaultClosed = false, children }: Props) {
  const [closed, setClosed] = useState(() => readClosed()[id] ?? defaultClosed)
  const toggle = () => {
    const next = !closed
    setClosed(next)
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...readClosed(), [id]: next }))
    } catch {
      // Best-effort only.
    }
  }
  return (
    <section className="mt-4 border-t border-arena-700 pt-2">
      <button
        onClick={toggle}
        aria-expanded={!closed}
        className="flex w-full items-center justify-between gap-2 py-1 text-left text-xs font-semibold uppercase tracking-widest text-slate-500 hover:text-slate-300"
      >
        <span>{title}</span>
        <span className="flex items-center gap-2">
          {closed && summary ? <span className="truncate text-[11px] font-normal normal-case tracking-normal text-slate-500">{summary}</span> : null}
          <span aria-hidden>{closed ? '▸' : '▾'}</span>
        </span>
      </button>
      {!closed && <div className="pt-2">{children}</div>}
    </section>
  )
}
