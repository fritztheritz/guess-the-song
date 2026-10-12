import { useEffect, useState } from 'react'
import type { PhoneRoundState } from '../lib/buzzer/protocol'
import { playerKey } from '../lib/blind-rank'
import { PhoneBanner, PhoneSongCard } from './PhoneParts'
import { tileClass } from './phone-tiles'

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
      <div className="w-full max-w-xs">
        <PhoneBanner tone="accent" title="🙈 ALL PLACED">
          {stat ? (
            <>
              You matched the group exactly on <span className="font-semibold text-white">{stat.exact}</span> of {stat.answered} songs — off by {stat.avgOff.toFixed(1)} slots on average.
            </>
          ) : (
            "Check the screen for the group's final ranking."
          )}
        </PhoneBanner>
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
      <PhoneSongCard title={blind.song.title} artist={blind.song.artist} artworkUrl={blind.song.artworkUrl} />

      {placed !== undefined ? (
        <PhoneBanner title={`🔒 THE GROUP PUT IT AT #${placed}`}>
          {suggestion === undefined ? "You didn't suggest a slot." : suggestion === placed ? `You said #${suggestion} — spot on!` : `You said #${suggestion}.`}
        </PhoneBanner>
      ) : (
        <>
          <p className="text-sm text-slate-300">Where should it go? 1 = favorite. This is just your vote — the host decides.</p>
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
                  className={tileClass(title !== undefined ? 'taken' : chosen ? 'chosen' : 'idle')}
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
