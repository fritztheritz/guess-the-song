import { useEffect, useState } from 'react'
import type { PhoneRoundState } from '../lib/buzzer/protocol'

type TierlistState = NonNullable<PhoneRoundState['tierlist']>

// A voter's private tier list on their own phone: every song gets one tap on the tier it belongs in
// (no dragging — it's unreliable on touch). A placed song folds down to a one-line row (tap to
// change it) so what's left to do is obvious, and Submit unlocks once every song has a tier.
export default function TierBallot({ state, onSubmit }: { state: TierlistState; onSubmit: (tierIndexes: number[]) => void }) {
  const [choices, setChoices] = useState<(number | null)[]>(() => state.songs.map(() => null))
  // Placed songs the voter has reopened to change.
  const [reopened, setReopened] = useState<Set<number>>(() => new Set())
  const [sent, setSent] = useState(false)
  const placed = choices.filter((c) => c !== null).length
  const total = state.songs.length
  const complete = placed === total

  // If the host never confirms (rejected ballot, dropped connection), let the voter try again.
  useEffect(() => {
    if (!sent) return
    const t = setTimeout(() => setSent(false), 6000)
    return () => clearTimeout(t)
  }, [sent])

  function choose(i: number, t: number) {
    setChoices((prev) => prev.map((c, j) => (j === i ? t : c)))
    setReopened((prev) => {
      const next = new Set(prev)
      next.delete(i)
      return next
    })
  }

  return (
    <div className="w-full max-w-sm space-y-3 text-left">
      <div className="sticky top-0 z-10 -mx-1 rounded-b-xl bg-arena-950/95 px-1 pb-2 pt-2 backdrop-blur">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
          <span>Put every song in a tier</span>
          <span className={complete ? 'font-semibold text-scoreboard-green' : ''}>
            {placed} / {total}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-arena-700" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={placed}>
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${complete ? 'bg-scoreboard-green' : 'bg-hardwood-500'}`}
            style={{ width: `${total ? (placed / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <ul className="space-y-2">
        {state.songs.map((song, i) => {
          const choice = choices[i]
          const chosen = choice !== null ? state.tiers[choice] : null
          const folded = chosen && !reopened.has(i)
          const listen = song.url ? (
            <a
              href={song.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Listen to ${song.title}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-arena-700 text-sm text-slate-200 hover:bg-arena-600"
            >
              ▶
            </a>
          ) : null
          if (folded) {
            return (
              <li key={song.id}>
                <button
                  onClick={() => setReopened((prev) => new Set(prev).add(i))}
                  disabled={sent}
                  aria-label={`${song.title}: ${chosen.name}. Change`}
                  className="flex w-full items-center gap-2.5 rounded-xl border-l-4 bg-arena-800/60 p-2 text-left opacity-80 disabled:opacity-50"
                  style={{ borderLeftColor: chosen.color }}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{song.title}</span>
                  <span className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold text-arena-950" style={{ background: chosen.color }}>
                    {chosen.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-500">Change</span>
                </button>
              </li>
            )
          }
          return (
            <li key={song.id} className="rounded-xl border border-arena-600 bg-arena-800 p-2.5">
              <div className="flex items-center gap-2.5">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-arena-700">
                  {song.artworkUrl ? <img src={song.artworkUrl} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-100">{song.title}</div>
                  <div className="truncate text-xs text-slate-500">{song.artist}</div>
                </div>
                {listen}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {state.tiers.map((tier, t) => {
                  const on = choice === t
                  return (
                    <button
                      key={t}
                      disabled={sent}
                      aria-pressed={on}
                      aria-label={`${song.title}: ${tier.name}`}
                      onClick={() => choose(i, t)}
                      className="min-h-10 min-w-10 rounded-full px-3 text-sm font-semibold transition disabled:opacity-50"
                      style={on ? { background: tier.color, color: '#05060a' } : { background: `${tier.color}22`, color: tier.color }}
                    >
                      {tier.name}
                    </button>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="sticky bottom-0 -mx-1 bg-arena-950 px-1 pb-3 pt-3">
        <button
          onClick={() => {
            setSent(true)
            onSubmit(choices as number[])
          }}
          disabled={!complete || sent}
          className="min-h-14 w-full rounded-xl bg-hardwood-500 text-lg font-semibold text-arena-950 shadow-lg disabled:opacity-40 hover:bg-hardwood-400"
        >
          {sent ? 'Sending…' : complete ? 'SUBMIT MY TIER LIST' : `${total - placed} left to place`}
        </button>
      </div>
    </div>
  )
}
