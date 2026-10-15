import BackLink from '../components/BackLink'
import SegDigits from '../components/SegDigits'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getTierList, saveTierList } from '../lib/storage/tierlist-repository'
import { BuzzerSocket, type SocketStatus } from '../lib/buzzer/buzzer-socket'
import { generateRoomCode, isBuzzerConfigured } from '../lib/buzzer/config'
import type { BuzzerPlayer, PhoneRoundState } from '../lib/buzzer/protocol'
import { playerKey } from '../lib/blind-rank'
import { BLIND_SAVE_PREFIX, emptySlots, nextEmptySlot, placeInSlot, rankingToTierList, suggestionStats, type Slots, type Suggestions } from '../lib/slot-ranking'
import { useFeatureFlag } from '../state/feature-flags-context'
import ConnectionBanner from '../components/ConnectionBanner'
import JoinLink from '../components/JoinLink'
import JoinQrCode from '../components/JoinQrCode'
import { shuffled } from '../lib/quick-game'
import { playCorrect, playFanfare, playHorn, playSqueak } from '../lib/sound-effects'
import { useToast } from '../state/toast-context'
import { useWakeLock } from '../lib/use-wake-lock'
import { downloadRankingImage } from '../lib/ranking-image'
import Confetti from '../components/Confetti'
import SoundControl from '../components/SoundControl'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Panel from '../components/ui/Panel'
import type { TierListSong } from '../types/tierlist'
import { Icon } from '../components/Icon'
import { withIcons } from '../lib/with-icons'
import ArtPlaceholder from '../components/ArtPlaceholder'

const MIN_SONGS = 3
const MAX_SONGS = 25

type Stage = 'lobby' | 'playing' | 'results'

interface SavedGame {
  songIds: string[]
  slots: Slots
  index: number
  stage: Stage
  justPlaced: number | null
  /** Phones: the room code (so phones can rejoin after a reload) and what they've suggested so far. */
  phonesOn?: boolean
  code?: string
  suggestions?: Suggestions
  /** When this was last saved — lets Home offer "continue". */
  savedAt?: string
}

const saveKey = (listId: string) => `${BLIND_SAVE_PREFIX}${listId}`

const VOTER_TEAM_ID = 'players'

// A stable colour per player name, so the same person is the same colour on every slot.
const CHIP_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#ec4899', '#eab308', '#14b8a6', '#a855f7', '#ef4444']
function chipColor(name: string): string {
  let h = 0
  for (const ch of playerKey(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return CHIP_COLORS[h % CHIP_COLORS.length]
}

function loadSaved(listId: string, available: TierListSong[]): SavedGame | null {
  try {
    const raw = localStorage.getItem(saveKey(listId))
    if (!raw) return null
    const g = JSON.parse(raw) as SavedGame
    const byId = new Map(available.map((s) => [s.id, s]))
    if (!Array.isArray(g.songIds) || g.songIds.length < MIN_SONGS || !g.songIds.every((id) => byId.has(id))) return null
    if (!Array.isArray(g.slots) || g.slots.length !== g.songIds.length || (g.stage !== 'playing' && g.stage !== 'results')) return null
    return g
  } catch {
    return null
  }
}

// Blind Ranking on one shared screen: a song comes up, the room argues about where it belongs, and the
// host drops it into a numbered slot (1 = favorite). Slots are final, so later songs have to fit around
// what's already down — the list fills in from the middle out as the group's taste takes shape.
export default function BlindRankingGroup() {
  const { tierListId = '' } = useParams()
  const navigate = useNavigate()
  const showToast = useToast()
  useWakeLock(true)
  const list = useMemo(() => getTierList(tierListId), [tierListId])
  const available = Math.min(list?.songs.length ?? 0, MAX_SONGS)
  const [count, setCount] = useState(Math.min(available, 10))
  // A game in progress survives a reload: it's restored from localStorage if its songs still exist.
  const [saved] = useState(() => loadSaved(tierListId, list?.songs ?? []))
  const [songs, setSongs] = useState<TierListSong[]>(() => {
    const byId = new Map((list?.songs ?? []).map((s) => [s.id, s]))
    return saved ? saved.songIds.map((id) => byId.get(id)!) : []
  })
  const [stage, setStage] = useState<Stage>(saved?.stage ?? 'lobby')
  const [index, setIndex] = useState(saved?.index ?? 0)
  const [slots, setSlots] = useState<Slots>(saved?.slots ?? [])
  const [selected, setSelected] = useState<number | null>(null)
  const [justPlaced, setJustPlaced] = useState<number | null>(saved?.justPlaced ?? null)
  const [shaking, setShaking] = useState(false)
  useEffect(() => {
    if (!shaking) return
    const t = setTimeout(() => setShaking(false), 380)
    return () => clearTimeout(t)
  }, [shaking])
  // Phones are optional: they join a room and *suggest* a slot for each song; the host still makes the call.
  const phonesAvailable = useFeatureFlag('phone-buzzer') && isBuzzerConfigured()
  const [phonesOn, setPhonesOn] = useState(saved?.phonesOn ?? false)
  const [code] = useState(() => saved?.code ?? generateRoomCode())
  const [suggestions, setSuggestions] = useState<Suggestions>(saved?.suggestions ?? {})
  const [revealed, setRevealed] = useState(false)
  const [players, setPlayers] = useState<BuzzerPlayer[]>([])
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const socketRef = useRef<BuzzerSocket | null>(null)
  const playersRef = useRef<BuzzerPlayer[]>([])
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
    setSuggestions({})
    setRevealed(false)
    setStage('playing')
  }

  useEffect(() => {
    try {
      if (stage === 'lobby') localStorage.removeItem(saveKey(tierListId))
      else localStorage.setItem(saveKey(tierListId), JSON.stringify({ songIds: songs.map((s) => s.id), slots, index, stage, justPlaced, phonesOn, code, suggestions, savedAt: new Date().toISOString() } satisfies SavedGame))
    } catch {
      // Storage unavailable — the game still works, it just won't survive a reload.
    }
  }, [tierListId, songs, slots, index, stage, justPlaced, phonesOn, code, suggestions])

  const handleGuess = useCallback((connId: string, text: string) => {
    const { stage: st, index: i, slots: cur, justPlaced: placed } = live.current
    if (st !== 'playing' || placed !== null) return
    const player = playersRef.current.find((p) => p.connId === connId)
    const m = /^(\d+):(\d+)$/.exec(text.trim())
    if (!player || !m || Number(m[1]) !== i) return
    const slot = Number(m[2])
    if (slot < 1 || slot > cur.length || cur[slot - 1] !== null) return
    const key = playerKey(player.name)
    setSuggestions((prev) => ({ ...prev, [key]: { name: player.name.trim(), bySong: { ...prev[key]?.bySong, [i]: slot } } }))
  }, [])

  useEffect(() => {
    if (!phonesOn || !phonesAvailable || !list) return
    const socket = new BuzzerSocket(code, 'host')
    socketRef.current = socket
    const offStatus = socket.onStatus(setStatus)
    const off = socket.onMessage((msg) => {
      if (msg.type === 'roster') {
        playersRef.current = msg.players
        setPlayers(msg.players)
      } else if (msg.type === 'guess') {
        handleGuess(msg.connId, msg.text)
      } else if (msg.type === 'state' && live.current.stage === 'playing' && msg.buzzState === 'closed') {
        // The room lost its state (host just connected / room recycled) — open suggestions again.
        socket.send({ type: 'open' })
      }
    })
    socket.connect()
    return () => {
      socket.send({ type: 'close' })
      off()
      offStatus()
      socket.close()
      socketRef.current = null
    }
  }, [phonesOn, phonesAvailable, list, code, handleGuess])

  const stats = useMemo(() => (stage === 'results' ? suggestionStats(suggestions, slots) : []), [stage, suggestions, slots])

  // What phones see: the current song and the slots already taken, then — at the end — how close they were.
  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !phonesOn) return
    const song = stage === 'playing' ? songs[index] : null
    const state: PhoneRoundState = {
      gameName: list?.name ?? 'Blind Ranking',
      possessionIndex: index,
      totalPossessions: songs.length,
      phase: stage === 'results' ? 'final' : stage === 'playing' ? 'clue' : 'intro',
      mode: 'blindrank',
      clueText: null,
      revealed: null,
      teams: [],
      blind: {
        index,
        total: songs.length,
        song: song ? { title: song.title, artist: song.artist, artworkUrl: song.artworkUrl } : null,
        group: {
          taken: slots.flatMap((s, i) => (s === null ? [] : [{ slot: i + 1, title: songs[s].title }])).filter((t) => stage !== 'playing' || t.slot - 1 !== justPlaced),
          placedSlot: stage === 'playing' && justPlaced !== null ? justPlaced + 1 : undefined,
          stats: stage === 'results' ? stats : undefined,
        },
      },
    }
    socket.sendAndRemember({ type: 'sync-teams', teams: [{ id: VOTER_TEAM_ID, name: 'Players', color: '#ff6a13', avatar: '🙈' }] })
    socket.sendAndRemember({ type: 'sync-round', state })
    if (stage === 'playing') socket.send({ type: 'open' })
    else socket.send({ type: 'close' })
  }, [phonesOn, stage, index, slots, justPlaced, status, stats, songs, list?.name])

  const lockIn = useCallback(() => {
    const { selected: slot, index: i, slots: cur } = live.current
    if (slot === null) return
    const next = placeInSlot(cur, slot, i)
    if (!next) return
    setSlots(next)
    setJustPlaced(slot)
    setSelected(null)
    playHorn()
    playCorrect()
    setShaking(true)
  }, [])

  const advance = useCallback(() => {
    const { index: i, slots: cur } = live.current
    setJustPlaced(null)
    setRevealed(false)
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

  async function shareImage() {
    const ranked = slots.flatMap((s) => (s === null ? [] : [{ title: songs[s].title, artist: songs[s].artist }]))
    await downloadRankingImage(list?.name ?? 'Blind Ranking', ranked)
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
        <EmptyState icon="🔎" action={<BackLink to="/">Back home</BackLink>}>
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

  const locked = justPlaced !== null
  const current = stage === 'playing' ? songs[index] : null
  // Who suggested what for the song on screen — shown only after the reveal (or once it's locked in).
  const showSuggestions = revealed || locked
  const suggestedNames = Object.values(suggestions).filter((p) => p.bySong[index] !== undefined).map((p) => p.name)
  const chipsBySlot = new Map<number, string[]>()
  if (showSuggestions && stage === 'playing') {
    for (const p of Object.values(suggestions)) {
      const slot = p.bySong[index]
      if (slot !== undefined) chipsBySlot.set(slot - 1, [...(chipsBySlot.get(slot - 1) ?? []), p.name])
    }
  }
  const placedCount = slots.filter((x) => x !== null).length
  const twoColumns = slots.length > 8
  const ranked = slots.flatMap((s) => (s === null ? [] : [songs[s]]))

  return (
    <div className={`min-h-svh court-lines ${shaking ? 'animate-screen-shake' : ''}`}>
      {stage === 'results' && <Confetti />}
      <div className="mx-auto max-w-4xl px-4 pb-10 sm:px-6">
        <div className="flex items-center justify-between gap-3 py-5">
          <BackLink to={`/tierlists/${list.id}/present`}>Tier list</BackLink>
          <h1 className="title-page"><Icon name="eye-off" /> BLIND RANKING</h1>
          <SoundControl />
        </div>

        {stage === 'lobby' && (
          <div className="mx-auto max-w-2xl space-y-4">
            <Panel padding="md" className="space-y-5">
              <p className="text-sm text-slate-300">
                Songs from “{list.name}” come up one at a time. Talk it over as a group, then put each one in a numbered slot — 1 is the favorite. Once a
                slot is filled it's final, so leave room for what's still to come.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-arena-600 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-100">How many songs?</div>
                  <div className="text-xs text-slate-500">Random pick from {list.songs.length} in the list</div>
                </div>
                <div className="flex items-center gap-2" role="group" aria-label="Number of songs">
                  <button
                    type="button"
                    aria-label="Fewer songs"
                    onClick={() => setCount((c) => Math.max(MIN_SONGS, c - 1))}
                    disabled={count <= MIN_SONGS}
                    className="h-11 w-11 rounded-full border border-arena-500 text-xl text-white enabled:hover:border-hardwood-500 disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="scoreboard-digit w-12 text-center font-display text-4xl text-white" aria-live="polite">
                    {count}
                  </span>
                  <button
                    type="button"
                    aria-label="More songs"
                    onClick={() => setCount((c) => Math.min(available, c + 1))}
                    disabled={count >= available}
                    className="h-11 w-11 rounded-full border border-arena-500 text-xl text-white enabled:hover:border-hardwood-500 disabled:opacity-40"
                  >
                    +
                  </button>
                  {available > count && (
                    <button type="button" onClick={() => setCount(available)} className="ml-1 rounded-full px-3 py-1.5 text-xs text-slate-400 hover:text-white">
                      All {available}
                    </button>
                  )}
                </div>
              </div>
              {phonesAvailable && (
                <div className="rounded-xl border border-arena-600 p-4">
                  {!phonesOn ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">Phones</div>
                        <div className="text-xs text-slate-500">Optional — people can suggest where each song goes.</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setPhonesOn(true)}>
                        <Icon name="phone" /> Let phones join
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-5">
                        <JoinQrCode code={code} size={110} />
                        <div>
                          <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Scan or enter the code</div>
                          <div className="font-display text-4xl tracking-[0.3em] text-white">{code}</div>
                        </div>
                      </div>
                      <JoinLink code={code} />
                      <ConnectionBanner status={status} />
                      <div className="flex flex-wrap items-center gap-1.5" aria-label="Players joined">
                        {players.length === 0 && <span className="text-xs text-slate-500">Nobody has joined yet — you can start without them.</span>}
                        {players.map((p) => (
                          <span key={p.connId} className="rounded-full px-3 py-1 text-xs" style={{ background: `${chipColor(p.name)}33`, color: chipColor(p.name) }}>
                            <Icon name="phone" /> {p.name}
                          </span>
                        ))}
                        <button type="button" onClick={() => setPhonesOn(false)} className="ml-auto text-xs text-slate-500 hover:text-white">
                          Turn phones off
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Panel>
            <div className="flex justify-center">
              <Button size="lg" onClick={start}>
                START →
              </Button>
            </div>
          </div>
        )}

        {stage === 'playing' && current && (
          // Stays put while the slot list scrolls, so the song being placed is always in view.
          <div className="sticky top-0 z-10 mb-4 pb-3 pt-2">
            <Panel padding="sm" className="ticket flex flex-wrap items-center gap-4 !bg-arena-800 px-6">
              <div key={current.id} className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-arena-800 animate-pop-in sm:h-24 sm:w-24">
                {current.artworkUrl ? <img src={current.artworkUrl} alt="" className="h-full w-full object-cover" /> : <ArtPlaceholder seed={`${current.title} ${current.artist ?? ''}`} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-widest text-slate-500">
                  Song {index + 1} of {total} ·{' '}
                  <SegDigits value={total - placedCount} cells={2} className="align-middle text-sm text-scoreboard-amber" label={`${total - placedCount}`} />{' '}
                  {total - placedCount === 1 ? 'slot' : 'slots'} left
                </div>
                <div className="truncate font-display text-3xl text-white sm:text-4xl">{current.title}</div>
                <div className="truncate text-lg text-slate-400">{current.artist}</div>
                {current.soundcloudUrl && (
                  <a href={current.soundcloudUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-hardwood-400 hover:underline">
                    ▶ Play on SoundCloud ↗
                  </a>
                )}
              </div>
              <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:border-l-2 sm:border-dashed sm:border-arena-500 sm:pl-4">
                {locked ? (
                  <Button size="lg" onClick={advance}>
                    {index >= total - 1 ? 'SEE RESULTS →' : 'NEXT SONG →'}
                  </Button>
                ) : (
                  <Button size="lg" onClick={lockIn} disabled={selected === null}>
                    {selected === null ? 'PICK A SLOT' : withIcons(`🔒 LOCK IN #${selected + 1}`)}
                  </Button>
                )}
                <span className="text-center text-[11px] text-slate-500">{locked ? 'Enter for next' : '↑ ↓ to choose · Enter to lock'}</span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-arena-800"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={placedCount}
                aria-label="Songs placed"
              >
                <div className="h-full rounded-full bg-hardwood-500 transition-[width] duration-300" style={{ width: `${(placedCount / total) * 100}%` }} />
              </div>
            </Panel>
          </div>
        )}

        {stage !== 'lobby' && (
          <div className="space-y-5">
            {current && phonesOn && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400" aria-label="Phone suggestions">
                <span>
                  <Icon name="phone" /> {suggestedNames.length} of {players.length} {players.length === 1 ? 'player has' : 'players have'} suggested
                </span>
                {!showSuggestions && suggestedNames.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setRevealed(true)}>
                    <Icon name="eye" /> Reveal suggestions
                  </Button>
                )}
              </div>
            )}

            {stage === 'results' && (
              <div className="space-y-5">
                <Podium songs={ranked} />
                {stats.length > 0 && (
                  <Panel padding="sm" className="space-y-1">
                    <div className="text-xs uppercase tracking-widest text-slate-500">How close were the phones to the group's calls?</div>
                    {stats.map((st, i) => (
                      <div key={st.name} className="flex flex-wrap items-baseline gap-x-3 text-slate-200">
                        <span className="font-semibold" style={{ color: chipColor(st.name) }}>
                          {st.name}
                        </span>
                        <span className="text-sm text-slate-400">
                          {st.exact} exact of {st.answered} · off by {st.avgOff.toFixed(1)} slots
                        </span>
                        {i === 0 && stats.length > 1 && <span className="text-xs text-scoreboard-green">closest to the group</span>}
                        {i === stats.length - 1 && stats.length > 1 && <span className="text-xs text-hardwood-400">most contrarian</span>}
                      </div>
                    ))}
                  </Panel>
                )}
                <div className="flex flex-wrap justify-center gap-3">
                  <Button onClick={saveAsTierList}><Icon name="save" /> Save as tier list</Button>
                  <Button variant="outline" onClick={shareImage}>
                    <Icon name="image" /> Save as image
                  </Button>
                  <Button variant="outline" onClick={copyResults}>
                    <Icon name="clipboard" /> Copy ranking
                  </Button>
                  <Button variant="outline" onClick={() => setStage('lobby')}>
                    Play again
                  </Button>
                </div>
              </div>
            )}

            <div>
              <div className="mb-1 flex justify-between text-[11px] uppercase tracking-widest text-slate-500">
                <span><Icon name="star-solid" /> favorite</span>
                <span>Least favorite</span>
              </div>
              <ol
                className={`gap-1.5 ${twoColumns ? 'grid md:grid-flow-col md:grid-cols-2 md:[grid-template-rows:repeat(var(--rows),auto)]' : 'space-y-1.5'}`}
                style={twoColumns ? ({ '--rows': Math.ceil(slots.length / 2) } as React.CSSProperties) : undefined}
                aria-label="Ranking slots"
              >
                {slots.map((songIndex, slot) => {
                  const song = songIndex === null ? null : songs[songIndex]
                  const isSelected = selected === slot
                  const fresh = justPlaced === slot
                  const empty = song === null
                  const clickable = empty && stage === 'playing' && !locked
                  const chips = chipsBySlot.get(slot)
                  const agree = (chips?.length ?? 0) >= 2
                  return (
                    <li key={slot}>
                      <button
                        type="button"
                        disabled={!clickable}
                        onClick={() => {
                          if (!isSelected) playSqueak()
                          setSelected(isSelected ? null : slot)
                        }}
                        aria-label={song ? `Slot ${slot + 1}: ${song.title}` : `Slot ${slot + 1}, empty`}
                        aria-pressed={clickable ? isSelected : undefined}
                        className={`relative flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition ${
                          fresh
                            ? 'animate-pop-in border-hardwood-400 bg-hardwood-500/20'
                            : isSelected
                              ? 'border-hardwood-400 bg-hardwood-500/10'
                              : agree
                                ? 'border-scoreboard-green/60 bg-scoreboard-green/5'
                                : empty
                                  ? 'border-dashed border-arena-600 text-slate-500 enabled:hover:border-hardwood-500'
                                  : 'border-arena-600 bg-arena-800'
                        }`}
                      >
                        <span aria-hidden className={`jersey-num w-11 shrink-0 select-none text-center text-[2.5rem] leading-none ${empty ? 'text-hardwood-500/50' : 'text-hardwood-400'}`}>
                          {slot + 1}
                        </span>
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
                        {chips && (
                          <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
                            {agree && <span className="marker text-sm text-scoreboard-green"><Icon name="users" /> {chips.length} agree</span>}
                            {chips.map((n) => (
                              <span key={n} className="rounded-full px-2.5 py-1 text-sm font-semibold" style={{ background: `${chipColor(n)}33`, color: chipColor(n) }}>
                                {n}
                              </span>
                            ))}
                          </span>
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

// The top three on a podium (winner in the middle and tallest) — mirrors the game's final podium.
function Podium({ songs }: { songs: TierListSong[] }) {
  const top = songs.slice(0, 3)
  if (top.length < 2) return null
  const order = top.length === 3 ? [1, 0, 2] : [1, 0]
  const heights = ['h-32', 'h-24', 'h-16']
  const medals = ['🥇', '🥈', '🥉']
  return (
    <div className="flex items-end justify-center gap-3" aria-label="Top three">
      {order.map((rank) => {
        const song = top[rank]
        return (
          <div key={song.id} className="flex w-1/3 max-w-[11rem] flex-col items-center gap-1.5 animate-pop-in" style={{ animationDelay: `${(2 - rank) * 150}ms` }}>
            {rank === 0 && <span className="sticker -mb-0.5 text-sm">Champ</span>}
            <div className="h-16 w-16 overflow-hidden rounded-xl bg-arena-800">
              {song.artworkUrl ? <img src={song.artworkUrl} alt="" className="h-full w-full object-cover" /> : <ArtPlaceholder seed={`${song.title} ${song.artist ?? ''}`} />}
            </div>
            <div className="max-w-full truncate text-center font-display text-lg text-slate-100">{song.title}</div>
            <div className={`hardwood relative flex w-full items-start justify-center overflow-hidden rounded-t-xl border-2 border-b-0 border-black/40 pt-2 ${heights[rank]}`}>
              <span className="text-2xl" aria-hidden>
                {withIcons(medals[rank])}
              </span>
              <span aria-hidden className="jersey-num absolute bottom-1 right-2 select-none text-5xl leading-none text-black/45">
                {rank + 1}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
