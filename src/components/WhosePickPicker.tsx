import { useEffect, useMemo, useState } from 'react'
import type { PhoneRoundState } from '../lib/buzzer/protocol'
import { ownerTag } from '../lib/whose-pick'
import { Icon } from './Icon'
import ArtPlaceholder from './ArtPlaceholder'
import { PhoneBanner, PhoneSongCard } from './PhoneParts'
import { tileClass } from './phone-tiles'

type WhosePick = NonNullable<PhoneRoundState['whosePick']>

const storageKey = (code: string) => `gts.wp.${code.toUpperCase()}`

interface Saved {
  /** Songs this phone owns, as of the last picking state it saw — so it knows to sit a song out later. */
  mine: string[]
  /** What it answered for each song: songId → option index. */
  answers: Record<string, number>
}

function load(code: string): Saved {
  try {
    const raw = JSON.parse(sessionStorage.getItem(storageKey(code)) ?? '{}') as Partial<Saved>
    return { mine: raw.mine ?? [], answers: raw.answers ?? {} }
  } catch {
    return { mine: [], answers: {} }
  }
}

// Phone side of Whose Pick Is This?: claim a few favourites from the pool (nobody else can have the same one),
// then, as each song plays, name the friend you think picked it. The host settles every claim and answer.
export default function WhosePickPicker({
  state,
  code,
  myName,
  onPick,
  onGuess,
}: {
  state: WhosePick
  code: string
  myName: string
  onPick: (songId: string) => void
  onGuess: (songId: string, optionIndex: number) => void
}) {
  const [initial] = useState<Saved>(() => load(code))
  // Songs this phone owns (as of the last picking state it saw — that's how it knows to sit one out later) and
  // what it answered for each song.
  const [mineIds, setMineIds] = useState<string[]>(initial.mine)
  const [answers, setAnswers] = useState<Record<string, number>>(initial.answers)
  const [filter, setFilter] = useState('')
  // Taps waiting on the host's say-so; dropped as soon as the host's state shows who really got the song.
  const [pending, setPending] = useState<Set<string>>(new Set())
  const myTag = ownerTag(myName)

  const claimedMine = useMemo(() => (state.claimed ? Object.keys(state.claimed).filter((id) => state.claimed![id] === myTag) : null), [state.claimed, myTag])
  // New claims from the host replace the local picture (adjusting state while rendering, per the React docs, rather than in an effect).
  const [seenClaims, setSeenClaims] = useState(state.claimed)
  if (state.claimed !== seenClaims) {
    setSeenClaims(state.claimed)
    if (claimedMine) setMineIds(claimedMine)
    setPending(new Set())
  }
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(code), JSON.stringify({ mine: mineIds, answers } satisfies Saved))
    } catch {
      // Best-effort only.
    }
  }, [mineIds, answers, code])

  if (state.stage === 'final') {
    return (
      <div className="w-full max-w-xs">
        <PhoneBanner tone="accent" title={<><Icon name="trophy" /> THAT'S THE GAME</>}>
          Check the screen for the scores and who fooled the room best.
        </PhoneBanner>
      </div>
    )
  }

  if (state.stage === 'picking') {
    const pool = state.pool ?? []
    const limit = state.limit ?? 3
    const q = filter.trim().toLowerCase()
    const shown = q ? pool.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(q)) : pool
    const mine = claimedMine ?? mineIds
    const full = mine.length >= limit
    return (
      <div className="w-full max-w-sm space-y-3 text-left">
        <div className="text-center">
          <div className="font-display text-2xl tracking-wide text-white">PICK YOUR {limit === 1 ? 'FAVORITE' : `${limit} FAVORITES`}</div>
          <div className="text-xs text-slate-400">Secret until the game — and nobody else can take the same one.</div>
          <div className="mt-2 flex justify-center gap-1.5" aria-label={`${mine.length} of ${limit} picked`}>
            {Array.from({ length: limit }, (_, i) => (
              <span key={i} className={`h-2.5 w-8 rounded-sm ${i < mine.length ? 'bg-hardwood-500' : 'bg-arena-600'}`} />
            ))}
          </div>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter songs…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Filter songs"
          className="w-full rounded-full border border-arena-600 bg-arena-800 px-4 py-2 text-sm text-slate-100 outline-none focus:border-hardwood-500"
        />
        <ul className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1" aria-label="Songs to pick from">
          {shown.map((s) => {
            const owner = state.claimed?.[s.id]
            const isMine = owner === myTag
            const taken = !!owner && !isMine
            const isPending = pending.has(s.id)
            const blocked = taken || (!isMine && full)
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    setPending((p) => new Set(p).add(s.id))
                    onPick(s.id)
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left ${
                    isMine ? 'border-hardwood-500 bg-hardwood-500/15' : taken ? 'border-arena-700 bg-arena-800/40 opacity-50' : 'border-arena-600 bg-arena-800 enabled:active:scale-[0.98]'
                  } ${isPending && !isMine ? 'animate-pulse' : ''} disabled:cursor-not-allowed`}
                >
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-arena-700">
                    <ArtPlaceholder seed={`${s.title} ${s.artist}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-100">{s.title}</span>
                    <span className="block truncate text-xs text-slate-500">{s.artist}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold">
                    {isMine ? <span className="text-hardwood-400"><Icon name="check" /> yours</span> : taken ? <span className="text-slate-500">taken</span> : null}
                  </span>
                </button>
              </li>
            )
          })}
          {shown.length === 0 && <li className="py-6 text-center text-sm text-slate-500">No songs match “{filter}”.</li>}
        </ul>
        {full && <p className="text-center text-xs text-slate-400">That's all your picks — tap one of yours to swap it. The host starts the game.</p>}
      </div>
    )
  }

  // guessing / revealed
  const song = state.song
  const options = state.options ?? []
  if (!song) return null
  const iOwn = mineIds.includes(song.id)
  const answer = answers[song.id]

  if (iOwn) {
    return (
      <div className="w-full max-w-xs space-y-3">
        <PhoneSongCard title={song.title} artist={song.artist} artworkUrl={song.artworkUrl} />
        <PhoneBanner tone="accent" title={<><Icon name="eye-off" /> THIS ONE'S YOURS</>}>
          {state.stage === 'revealed' ? 'It\'s out — see how many you fooled on the screen.' : 'Keep a poker face. You sit this one out.'}
        </PhoneBanner>
      </div>
    )
  }

  if (state.stage === 'revealed') {
    const right = state.answer !== undefined && answer === state.answer
    return (
      <div className="w-full max-w-xs space-y-3">
        <PhoneSongCard title={song.title} artist={song.artist} artworkUrl={song.artworkUrl} />
        <PhoneBanner tone={right ? 'good' : 'neutral'} title={right ? <><Icon name="check" /> YOU GOT IT</> : answer === undefined ? 'NO GUESS IN' : 'NOT THIS TIME'}>
          It was <span className="font-semibold text-white">{state.answer !== undefined ? options[state.answer] : '…'}</span>'s pick.
        </PhoneBanner>
      </div>
    )
  }

  return (
    <div className="w-full max-w-xs space-y-3">
      <PhoneSongCard title={song.title} artist={song.artist} artworkUrl={song.artworkUrl} />
      <div className="text-center font-display text-2xl tracking-wide text-white">WHOSE PICK IS IT?</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((name, i) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              setAnswers((a) => ({ ...a, [song.id]: i }))
              onGuess(song.id, i)
            }}
            className={`${tileClass(answer === i ? 'chosen' : 'idle')} truncate px-2 py-3 text-lg`}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-slate-400">
        {answer === undefined ? 'Tap who you think it is.' : 'Locked in — change your mind any time before the reveal.'}
        {state.eligible ? ` ${state.answered ?? 0} of ${state.eligible} answered.` : ''}
      </p>
    </div>
  )
}
