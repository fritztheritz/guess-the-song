import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getTierList, saveTierList } from '../lib/storage/tierlist-repository'
import { emptySlots, nextEmptySlot, placeInSlot, rankingToTierList, type Slots } from '../lib/slot-ranking'
import { shuffled } from '../lib/quick-game'
import { playCorrect, playFanfare } from '../lib/sound-effects'
import { useToast } from '../state/toast-context'
import { useWakeLock } from '../lib/use-wake-lock'
import Confetti from '../components/Confetti'
import ProgressRing from '../components/ProgressRing'
import SoundControl from '../components/SoundControl'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Panel from '../components/ui/Panel'
import type { TierListSong } from '../types/tierlist'

const MIN_SONGS = 3
const MAX_SONGS = 25

type Stage = 'lobby' | 'playing' | 'results'

// Blind Ranking on one shared screen: a song comes up, the room argues about where it belongs, and the
// host drops it into a numbered slot (1 = favourite). Slots are final, so later songs have to fit around
// what's already down — the list fills in from the middle out as the group's taste takes shape.
export default function BlindRankingGroup() {
  const { tierListId = '' } = useParams()
  const navigate = useNavigate()
  const showToast = useToast()
  useWakeLock(true)
  const list = useMemo(() => getTierList(tierListId), [tierListId])
  const available = Math.min(list?.songs.length ?? 0, MAX_SONGS)
  const [count, setCount] = useState(Math.min(available, 10))
  const [songs, setSongs] = useState<TierListSong[]>([])
  const [stage, setStage] = useState<Stage>('lobby')
  const [index, setIndex] = useState(0)
  const [slots, setSlots] = useState<Slots>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [justPlaced, setJustPlaced] = useState<number | null>(null)
  const live = useRef({ stage, index, selected, justPlaced, slots })
  useEffect(() => {
    live.current = { stage, index, selected, justPlaced, slots }
  })
  const total = songs.length

  function start() {
    const picked = shuffled(list?.songs ?? []).slice(0, count)
    setSongs(picked)
    setSlots(emptySlots(picked.length))
    setIndex(0)
    setSelected(null)
    setJustPlaced(null)
    setStage('playing')
  }

  const lockIn = useCallback(() => {
    const { selected: slot, index: i, slots: cur } = live.current
    if (slot === null) return
    const next = placeInSlot(cur, slot, i)
    if (!next) return
    setSlots(next)
    setJustPlaced(slot)
    setSelected(null)
    playCorrect()
  }, [])

  const advance = useCallback(() => {
    const { index: i, slots: cur } = live.current
    setJustPlaced(null)
    if (i >= cur.length - 1) {
      setStage('results')
      playFanfare()
    } else {
      setIndex(i + 1)
      setSelected(null)
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const s = live.current
      if (s.stage !== 'playing' || (e.target as HTMLElement | null)?.closest('input, textarea, select, a')) return
      if (e.code === 'Enter') {
        e.preventDefault()
        if (s.justPlaced !== null) advance()
        else lockIn()
      } else if ((e.code === 'ArrowDown' || e.code === 'ArrowUp') && s.justPlaced === null) {
        e.preventDefault()
        const dir = e.code === 'ArrowDown' ? 1 : -1
        setSelected((cur) => {
          if (cur === null) return dir === 1 ? nextEmptySlot(s.slots, -1, 1) : nextEmptySlot(s.slots, s.slots.length, -1)
          return nextEmptySlot(s.slots, cur, dir)
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, lockIn])

  async function copyResults() {
    const lines = [`${list?.name} — Blind Ranking`]
    slots.forEach((s, i) => s !== null && lines.push(`${i + 1}. ${songs[s].title} — ${songs[s].artist}`))
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      showToast('Ranking copied to clipboard!')
    } catch {
      showToast('Could not copy the ranking.')
    }
  }

  function saveAsTierList() {
    if (!list) return
    const saved = saveTierList(rankingToTierList(list, songs, slots, `${list.name} — group ranking`))
    showToast('Saved as a new tier list')
    navigate(`/tierlists/${saved.id}/present`)
  }

  if (!list) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <EmptyState icon="🔎" action={<Link to="/" className="text-sm text-hardwood-400 underline">← Back home</Link>}>
          That tier list couldn't be found.
        </EmptyState>
      </div>
    )
  }
  if (list.songs.length < MIN_SONGS) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <EmptyState icon="🎵" action={<Link to={`/tierlists/${list.id}/edit`} className="text-sm text-hardwood-400 underline">Add songs</Link>}>
          Blind Ranking needs at least {MIN_SONGS} songs in the tier list.
        </EmptyState>
      </div>
    )
  }

  const current = stage === 'playing' ? songs[index] : null
  const locked = justPlaced !== null

  return (
    <div className="min-h-svh court-lines">
      {stage === 'results' && <Confetti />}
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link to={`/tierlists/${list.id}/present`} className="text-sm text-slate-400 hover:text-hardwood-400">
            ← Tier list
          </Link>
          <h1 className="font-display text-3xl tracking-wide text-white">🙈 BLIND RANKING</h1>
          <SoundControl />
        </div>

        {stage === 'lobby' && (
          <Panel padding="md" className="space-y-5">
            <p className="text-sm text-slate-300">
              Songs from “{list.name}” come up one at a time. Talk it over as a group, then put each one in a numbered slot — 1 is the favourite. Once a
              slot is filled it's final, so leave room for what's still to come.
            </p>
            <label className="flex items-center gap-3 text-sm text-slate-300">
              How many songs?
              <input
                type="number"
                min={MIN_SONGS}
                max={available}
                value={count}
                onChange={(e) => setCount(Math.max(MIN_SONGS, Math.min(available, Number(e.target.value) || MIN_SONGS)))}
                className="w-20 rounded-lg border border-arena-500 bg-arena-800 px-3 py-1.5 text-white"
              />
              <span className="text-xs text-slate-500">of {list.songs.length} (random pick, max {MAX_SONGS})</span>
            </label>
            <div className="flex justify-center">
              <Button size="lg" onClick={start}>
                START →
              </Button>
            </div>
          </Panel>
        )}

        {stage !== 'lobby' && (
          <div className="space-y-5">
            {current && (
              <Panel padding="md" className="flex flex-wrap items-center gap-4">
                <ProgressRing value={index + 1} max={total} size={52} label="songs" />
                <div key={current.id} className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-arena-800 animate-pop-in">
                  {current.artworkUrl ? <img src={current.artworkUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-4xl text-arena-500">♪</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs uppercase tracking-widest text-slate-500">
                    Song {index + 1} of {total}
                  </div>
                  <div className="truncate font-display text-3xl text-white sm:text-4xl">{current.title}</div>
                  <div className="truncate text-lg text-slate-400">{current.artist}</div>
                  {current.soundcloudUrl && (
                    <a href={current.soundcloudUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-hardwood-400 hover:underline">
                      ▶ Play on SoundCloud ↗
                    </a>
                  )}
                </div>
                <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto">
                  {locked ? (
                    <Button size="lg" onClick={advance}>
                      {index >= total - 1 ? 'SEE RESULTS →' : 'NEXT SONG →'}
                    </Button>
                  ) : (
                    <Button size="lg" onClick={lockIn} disabled={selected === null}>
                      {selected === null ? 'PICK A SLOT' : `🔒 LOCK IN #${selected + 1}`}
                    </Button>
                  )}
                  <span className="text-center text-[11px] text-slate-500">{locked ? 'Enter for next' : '↑ ↓ to choose · Enter to lock'}</span>
                </div>
              </Panel>
            )}

            {stage === 'results' && (
              <div className="flex flex-wrap justify-center gap-3">
                <Button onClick={saveAsTierList}>💾 Save as tier list</Button>
                <Button variant="outline" onClick={copyResults}>
                  📋 Copy ranking
                </Button>
                <Button variant="outline" onClick={() => setStage('lobby')}>
                  Play again
                </Button>
              </div>
            )}

            <div>
              <div className="mb-1 flex justify-between text-[11px] uppercase tracking-widest text-slate-500">
                <span>⭐ Favourite</span>
                <span>Least favourite</span>
              </div>
              <ol className="space-y-1.5" aria-label="Ranking slots">
                {slots.map((songIndex, slot) => {
                  const song = songIndex === null ? null : songs[songIndex]
                  const isSelected = selected === slot
                  const fresh = justPlaced === slot
                  const empty = song === null
                  const clickable = empty && stage === 'playing' && !locked
                  return (
                    <li key={slot}>
                      <button
                        type="button"
                        disabled={!clickable}
                        onClick={() => setSelected(isSelected ? null : slot)}
                        aria-label={song ? `Slot ${slot + 1}: ${song.title}` : `Slot ${slot + 1}, empty`}
                        aria-pressed={clickable ? isSelected : undefined}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                          fresh
                            ? 'animate-pop-in border-hardwood-400 bg-hardwood-500/20'
                            : isSelected
                              ? 'border-hardwood-400 bg-hardwood-500/10'
                              : empty
                                ? 'border-dashed border-arena-600 text-slate-500 enabled:hover:border-hardwood-500'
                                : 'border-arena-600 bg-arena-800'
                        }`}
                      >
                        <span className="w-8 shrink-0 text-center font-display text-2xl text-hardwood-400">{slot + 1}</span>
                        {song ? (
                          <>
                            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-arena-700">
                              {song.artworkUrl && <img src={song.artworkUrl} alt="" className="h-full w-full object-cover" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-slate-100">{song.title}</span>
                              <span className="block truncate text-xs text-slate-500">{song.artist}</span>
                            </span>
                          </>
                        ) : (
                          <span className="text-sm">{isSelected && current ? `← ${current.title}` : 'empty'}</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
