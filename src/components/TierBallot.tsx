import { useEffect, useState } from 'react'
import type { PhoneRoundState } from '../lib/buzzer/protocol'

type TierlistState = NonNullable<PhoneRoundState['tierlist']>

// A voter's private tier list on their own phone: every song gets one tap on the tier it belongs in
// (no dragging — it's unreliable on touch). Submit unlocks once every song has a tier.
export default function TierBallot({ state, onSubmit }: { state: TierlistState; onSubmit: (tierIndexes: number[]) => void }) {
  const [choices, setChoices] = useState<(number | null)[]>(() => state.songs.map(() => null))
  const [sent, setSent] = useState(false)
  const placed = choices.filter((c) => c !== null).length
  const complete = placed === state.songs.length

  // If the host never confirms (rejected ballot, dropped connection), let the voter try again.
  useEffect(() => {
    if (!sent) return
    const t = setTimeout(() => setSent(false), 6000)
    return () => clearTimeout(t)
  }, [sent])

  return (
    <div className="w-full max-w-sm space-y-3 text-left">
      <p className="text-center text-sm text-slate-300">
        Put every song in a tier — <span className="text-white">{placed}</span> of {state.songs.length} placed.
      </p>
      <ul className="space-y-2">
        {state.songs.map((song, i) => (
          <li key={song.id} className="rounded-xl border border-arena-600 bg-arena-800 p-2.5">
            <div className="flex items-center gap-2.5">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-arena-700">
                {song.artworkUrl ? <img src={song.artworkUrl} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-100">{song.title}</div>
                <div className="truncate text-xs text-slate-500">{song.artist}</div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {state.tiers.map((tier, t) => {
                const on = choices[i] === t
                return (
                  <button
                    key={t}
                    disabled={sent}
                    aria-pressed={on}
                    aria-label={`${song.title}: ${tier.name}`}
                    onClick={() => setChoices((prev) => prev.map((c, j) => (j === i ? t : c)))}
                    className="min-h-10 min-w-10 rounded-full px-3 text-sm font-semibold transition disabled:opacity-50"
                    style={on ? { background: tier.color, color: '#05060a' } : { background: `${tier.color}22`, color: tier.color }}
                  >
                    {tier.name}
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ul>
      <button
        onClick={() => {
          setSent(true)
          onSubmit(choices as number[])
        }}
        disabled={!complete || sent}
        className="sticky bottom-3 min-h-14 w-full rounded-xl bg-hardwood-500 text-lg font-semibold text-arena-950 shadow-lg disabled:opacity-40 hover:bg-hardwood-400"
      >
        {sent ? 'Sending…' : complete ? 'SUBMIT MY TIER LIST' : `${state.songs.length - placed} left to place`}
      </button>
    </div>
  )
}
