import { useEffect, useState } from 'react'
import type { PhoneRoundState } from '../lib/buzzer/protocol'
import { playerKey } from '../lib/blind-rank'

type Blind = NonNullable<PhoneRoundState['blind']>

const storageKey = (code: string) => `gts.blindg.${code.toUpperCase()}`

function load(code: string): Record<number, number> {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(code)) ?? '{}') as Record<number, number>
  } catch {
    return {}
  }
}

// Phone side of the one-screen Blind Ranking: you only *suggest* where the song should go (change your
// mind as often as you like) — the room talks it out and the host makes the final call on the big screen.
export default function BlindSuggestPicker({
  blind,
  code,
  myName,
  onSuggest,
}: {
  blind: Blind
  code: string
  myName: string
  onSuggest: (songIndex: number, slot: number) => void
}) {
  const [mine, setMine] = useState<Record<number, number>>(() => load(code))
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(code), JSON.stringify(mine))
    } catch {
      // Best-effort only.
    }
  }, [mine, code])

  const group = blind.group
  if (!group) return null

  if (blind.results || group.stats) {
    const stat = group.stats?.find((s) => playerKey(s.name) === playerKey(myName))
    return (
      <div className="w-full max-w-xs space-y-3 rounded-xl border border-hardwood-500/40 bg-hardwood-500/10 px-4 py-3 text-center">
        <div className="font-display text-xl tracking-wide text-hardwood-400">🙈 ALL PLACED</div>
        {stat ? (
          <p className="text-sm text-slate-200">
            You matched the group exactly on <span className="font-semibold text-white">{stat.exact}</span> of {stat.answered} songs — off by{' '}
            {stat.avgOff.toFixed(1)} slots on average.
          </p>
        ) : (
          <p className="text-sm text-slate-400">Check the screen for the group's final ranking.</p>
        )}
      </div>
    )
  }

  if (!blind.song) return <p className="text-sm text-slate-400">Waiting for the host to start — you'll suggest where each song goes.</p>

  const taken = new Map(group.taken.map((t) => [t.slot, t.title]))
  const suggestion = mine[blind.index]
  const placed = group.placedSlot

  function suggest(slot: number) {
    if (placed !== undefined || taken.has(slot)) return
    setMine((prev) => ({ ...prev, [blind.index]: slot }))
    onSuggest(blind.index, slot)
    navigator.vibrate?.(15)
  }

  return (
    <div className="w-full max-w-xs space-y-4">
      <div className="text-xs uppercase tracking-widest text-slate-500">
        Song {blind.index + 1} of {blind.total}
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-arena-600 bg-arena-800 p-3 text-left">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-arena-700">
          {blind.song.artworkUrl ? <img src={blind.song.artworkUrl} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-xl text-white">{blind.song.title}</div>
          <div className="truncate text-sm text-slate-400">{blind.song.artist}</div>
        </div>
      </div>

      {placed !== undefined ? (
        <div role="status" className="rounded-xl border-2 border-scoreboard-green bg-scoreboard-green/15 px-4 py-3 text-scoreboard-green">
          <div className="font-display text-xl tracking-wide">🔒 THE GROUP PUT IT AT #{placed}</div>
          <div className="text-xs text-slate-300">
            {suggestion === undefined ? "You didn't suggest a slot." : suggestion === placed ? `You said #${suggestion} — spot on!` : `You said #${suggestion}.`}
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-300">Where should it go? 1 = favourite. This is just your vote — the host decides.</p>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: blind.total }, (_, i) => i + 1).map((slot) => {
              const title = taken.get(slot)
              const chosen = suggestion === slot
              return (
                <button
                  key={slot}
                  onClick={() => suggest(slot)}
                  disabled={title !== undefined}
                  aria-pressed={chosen}
                  title={title ? `#${slot} is ${title}` : `Suggest #${slot}`}
                  className={`flex min-h-14 flex-col items-center justify-center rounded-xl border-2 font-display text-xl enabled:active:scale-95 disabled:border-transparent disabled:bg-arena-900 disabled:text-slate-600 ${
                    chosen ? 'border-hardwood-400 bg-hardwood-500/20 text-white' : 'border-arena-600 bg-arena-800 text-white'
                  }`}
                >
                  {slot}
                  {title && <span className="max-w-full truncate px-1 font-sans text-[9px] leading-tight text-slate-600">{title}</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
