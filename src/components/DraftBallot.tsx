import { useEffect, useState } from 'react'

export interface BallotDrafter {
  id: string
  name: string
  color: string
  avatar?: string
}

// A drafter's private ranking ballot on their own phone: every OTHER drafter, best roster first.
// Big up/down buttons (drag isn't dependable on touch screens), the roster's song titles under each
// name so you can judge whose is whose, and a single submit.
export default function DraftBallot({
  drafters,
  rosters,
  onSubmit,
}: {
  /** Everyone but the voter, in a starting order. */
  drafters: BallotDrafter[]
  rosters: Record<string, string[]>
  onSubmit: (rankedIds: string[]) => void
}) {
  const [order, setOrder] = useState(() => drafters.map((d) => d.id))
  const [sent, setSent] = useState(false)

  // If the host never confirms (rejected ballot, dropped connection), let the voter try again.
  useEffect(() => {
    if (!sent) return
    const t = setTimeout(() => setSent(false), 6000)
    return () => clearTimeout(t)
  }, [sent])

  function move(i: number, dir: -1 | 1) {
    setOrder((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  return (
    <div className="w-full max-w-xs space-y-3 text-left">
      <p className="text-center text-sm text-slate-300">Rank everyone else — best roster at the top.</p>
      <ol className="space-y-2">
        {order.map((id, i) => {
          const d = drafters.find((x) => x.id === id)
          if (!d) return null
          const titles = rosters[id] ?? []
          return (
            <li key={id} className="flex items-center gap-2 rounded-xl border border-arena-600 bg-arena-800 p-2">
              <span className="w-7 shrink-0 text-center font-display text-lg text-slate-500">#{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold" style={{ color: d.color }}>
                  {d.avatar ? `${d.avatar} ` : ''}
                  {d.name}
                </div>
                <div className="line-clamp-2 text-[11px] text-slate-500">{titles.join(' · ') || 'No picks'}</div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || sent}
                  aria-label={`Move ${d.name} up`}
                  className="flex h-9 w-11 items-center justify-center rounded-lg bg-arena-700 text-slate-200 disabled:opacity-25"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1 || sent}
                  aria-label={`Move ${d.name} down`}
                  className="flex h-9 w-11 items-center justify-center rounded-lg bg-arena-700 text-slate-200 disabled:opacity-25"
                >
                  ▼
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      <button
        onClick={() => {
          setSent(true)
          onSubmit(order)
        }}
        disabled={sent}
        className="min-h-14 w-full rounded-xl bg-hardwood-500 text-lg font-semibold text-arena-950 disabled:opacity-50 hover:bg-hardwood-400"
      >
        {sent ? 'Sending…' : 'SUBMIT MY BALLOT'}
      </button>
    </div>
  )
}
