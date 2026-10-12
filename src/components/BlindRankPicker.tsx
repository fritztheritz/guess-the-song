import { useEffect, useState } from 'react'
import type { PhoneRoundState } from '../lib/buzzer/protocol'
import { playerKey } from '../lib/blind-rank'

type Blind = NonNullable<PhoneRoundState['blind']>
interface Pick {
  slot: number
  title: string
}

const storageKey = (code: string) => `gts.blind.${code.toUpperCase()}`

function load(code: string): Record<number, Pick> {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(code)) ?? '{}') as Record<number, Pick>
  } catch {
    return {}
  }
}

// Phone side of Blind Ranking: the song to place, and the numbered slots 1..N. Tapping a slot locks the
// song there for good — a slot you've used is greyed out with what's in it, so you have to guess where
// the songs still to come will fit. Your own picks are kept on the phone (the room only sees each tap).
export default function BlindRankPicker({
  blind,
  code,
  myName,
  onPick,
}: {
  blind: Blind
  code: string
  myName: string
  onPick: (songIndex: number, slot: number) => void
}) {
  const [picks, setPicks] = useState<Record<number, Pick>>(() => load(code))
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(code), JSON.stringify(picks))
    } catch {
      // Best-effort only.
    }
  }, [picks, code])

  const total = blind.total
  const used = new Map(Object.values(picks).map((p) => [p.slot, p.title] as const))
  const mine = picks[blind.index]

  function choose(slot: number) {
    if (!blind.song || mine || used.has(slot)) return
    setPicks((prev) => ({ ...prev, [blind.index]: { slot, title: blind.song!.title } }))
    onPick(blind.index, slot)
    navigator.vibrate?.(20)
  }

  if (blind.results) {
    const ranked = Object.values(picks).sort((a, b) => a.slot - b.slot)
    const match = blind.results.matches.find((m) => playerKey(m.name) === playerKey(myName))
    return (
      <div className="w-full max-w-xs space-y-4 text-left">
        <div className="rounded-xl border border-hardwood-500/40 bg-hardwood-500/10 px-4 py-3 text-center">
          <div className="font-display text-xl tracking-wide text-hardwood-400">🙈 ALL PLACED</div>
          {match?.closest ? (
            <p className="mt-1 text-sm text-slate-200">
              Your closest match: <span className="font-semibold text-white">{match.closest}</span>
              {match.pct !== null ? ` (${Math.round(match.pct * 100)}% in sync)` : ''}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-400">Check the screen to see how everyone's lists compare.</p>
          )}
        </div>
        <ol className="space-y-1.5">
          {ranked.map((p) => (
            <li key={p.slot} className="flex items-center gap-3 rounded-lg bg-arena-800 px-3 py-2 text-sm">
              <span className="w-6 shrink-0 text-center font-display text-lg text-hardwood-400">{p.slot}</span>
              <span className="truncate text-slate-100">{p.title}</span>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  if (!blind.song) return <p className="text-sm text-slate-400">Waiting for the host to start — you'll place each song into a slot as it comes up.</p>

  return (
    <div className="w-full max-w-xs space-y-4">
      <div className="text-xs uppercase tracking-widest text-slate-500">
        Song {blind.index + 1} of {total}
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

      {mine ? (
        <div role="status" className="rounded-xl border-2 border-scoreboard-green bg-scoreboard-green/15 px-4 py-3 text-scoreboard-green">
          <div className="font-display text-xl tracking-wide">🔒 LOCKED IN AT #{mine.slot}</div>
          <div className="text-xs text-slate-300">No take-backs — waiting for the next song.</div>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-300">Where does it rank? 1 = your favourite. Pick carefully — it's final.</p>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: total }, (_, i) => i + 1).map((slot) => {
              const taken = used.get(slot)
              return (
                <button
                  key={slot}
                  onClick={() => choose(slot)}
                  disabled={taken !== undefined}
                  title={taken ? `#${slot} is ${taken}` : `Rank it #${slot}`}
                  className="flex min-h-14 flex-col items-center justify-center rounded-xl border-2 border-arena-600 bg-arena-800 font-display text-xl text-white enabled:active:scale-95 disabled:border-transparent disabled:bg-arena-900 disabled:text-slate-600"
                >
                  {slot}
                  {taken && <span className="max-w-full truncate px-1 font-sans text-[9px] leading-tight text-slate-600">{taken}</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
