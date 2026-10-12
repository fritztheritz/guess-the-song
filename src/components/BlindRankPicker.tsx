import { useEffect, useState } from 'react'
import type { PhoneRoundState } from '../lib/buzzer/protocol'
import { playerKey } from '../lib/blind-rank'
import { PhoneBanner, PhoneSongCard } from './PhoneParts'
import { tileClass } from './phone-tiles'

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
        <PhoneBanner tone="accent" title="🙈 ALL PLACED">
          {match?.closest ? (
            <>
              Your closest match: <span className="font-semibold text-white">{match.closest}</span>
              {match.pct !== null ? ` (${Math.round(match.pct * 100)}% in sync)` : ''}
            </>
          ) : (
            "Check the screen to see how everyone's lists compare."
          )}
        </PhoneBanner>
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
      <PhoneSongCard title={blind.song.title} artist={blind.song.artist} artworkUrl={blind.song.artworkUrl} />

      {mine ? (
        <PhoneBanner title={`🔒 LOCKED IN AT #${mine.slot}`}>No take-backs — waiting for the next song.</PhoneBanner>
      ) : (
        <>
          <p className="text-sm text-slate-300">Where does it rank? 1 = your favorite. Pick carefully — it's final.</p>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: total }, (_, i) => i + 1).map((slot) => {
              const taken = used.get(slot)
              return (
                <button
                  key={slot}
                  onClick={() => choose(slot)}
                  disabled={taken !== undefined}
                  title={taken ? `#${slot} is ${taken}` : `Rank it #${slot}`}
                  className={tileClass(taken !== undefined ? 'taken' : 'idle')}
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
