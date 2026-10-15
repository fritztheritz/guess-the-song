import BackLink from '../components/BackLink'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTierList } from '../lib/storage/tierlist-repository'
import { BuzzerSocket, type SocketStatus } from '../lib/buzzer/buzzer-socket'
import { generateRoomCode, isBuzzerConfigured } from '../lib/buzzer/config'
import type { BuzzerPlayer, PhoneRoundState } from '../lib/buzzer/protocol'
import { acceptPick, closestMatch, comparePlayers, mostUnique, orderOf, playerKey, songStats, type BlindPicks } from '../lib/blind-rank'
import { shuffled } from '../lib/quick-game'
import { playCorrect, playFanfare } from '../lib/sound-effects'
import { useFeatureFlag } from '../state/feature-flags-context'
import { useToast } from '../state/toast-context'
import { useWakeLock } from '../lib/use-wake-lock'
import ConnectionBanner from '../components/ConnectionBanner'
import Confetti from '../components/Confetti'
import JoinLink from '../components/JoinLink'
import JoinQrCode from '../components/JoinQrCode'
import ProgressRing from '../components/ProgressRing'
import SoundControl from '../components/SoundControl'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Panel from '../components/ui/Panel'
import type { TierListSong } from '../types/tierlist'
import { Icon } from '../components/Icon'
import { withIcons } from '../lib/with-icons'
import ArtPlaceholder from '../components/ArtPlaceholder'

const MAX_SONGS = 20
const MIN_SONGS = 3
const VOTER_TEAM_ID = 'players'

type Stage = 'lobby' | 'playing' | 'results'

// Blind Ranking, hosted from a tier list's songs: each song comes up once and every phone must lock it
// into a numbered slot before the next — no take-backs. At the end everyone's lists are compared (who's
// most in sync, whose taste is the odd one out, which songs split the room).
export default function BlindRanking() {
  const { tierListId = '' } = useParams()
  const enabled = useFeatureFlag('phone-buzzer') && isBuzzerConfigured()
  const showToast = useToast()
  useWakeLock(true)
  const list = useMemo(() => getTierList(tierListId), [tierListId])
  // A random subset (and order) of the list, fixed for this session.
  const [songs] = useState<TierListSong[]>(() => shuffled(list?.songs ?? []).slice(0, MAX_SONGS))
  const [code] = useState(generateRoomCode)
  const [stage, setStage] = useState<Stage>('lobby')
  const [index, setIndex] = useState(0)
  const [picks, setPicks] = useState<BlindPicks>({})
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [players, setPlayers] = useState<BuzzerPlayer[]>([])
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const socketRef = useRef<BuzzerSocket | null>(null)
  const playersRef = useRef<BuzzerPlayer[]>([])
  const live = useRef({ stage, index })
  live.current = { stage, index }
  const total = songs.length

  const handleGuess = useCallback(
    (connId: string, text: string) => {
      if (live.current.stage !== 'playing') return
      const player = playersRef.current.find((p) => p.connId === connId)
      const m = /^(\d+):(\d+)$/.exec(text.trim())
      if (!player || !m) return
      // A tap meant for an earlier song (a slow phone) must not land on this one.
      if (Number(m[1]) !== live.current.index) return
      setPicks((prev) => {
        const r = acceptPick(prev, player.name, Number(m[1]), Number(m[2]), total)
        if (r.accepted) playCorrect()
        return r.picks
      })
    },
    [total],
  )

  useEffect(() => {
    if (!enabled || !list) return
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
        // The room lost its state (host just connected / room recycled) — open guessing again.
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
  }, [enabled, list, code, handleGuess])

  const results = useMemo(() => {
    if (stage !== 'results') return null
    const lists = Object.values(picks)
    return {
      pairs: comparePlayers(picks),
      unique: mostUnique(picks),
      stats: songStats(picks, total),
      lists,
      matches: lists.map((p) => {
        const c = closestMatch(picks, p.name)
        return { name: p.name, closest: c?.name ?? null, pct: c?.similarity ?? null }
      }),
    }
  }, [stage, picks, total])

  // What phones see: the current song, or — at the end — how their list compares.
  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return
    const song = stage === 'playing' ? songs[index] : null
    const state: PhoneRoundState = {
      gameName: list?.name ?? 'Blind Ranking',
      possessionIndex: index,
      totalPossessions: total,
      phase: stage === 'results' ? 'final' : stage === 'playing' ? 'clue' : 'intro',
      mode: 'blindrank',
      clueText: null,
      revealed: null,
      teams: [],
      blind: {
        index,
        total,
        song: song ? { title: song.title, artist: song.artist, artworkUrl: song.artworkUrl } : null,
        results:
          stage === 'results' && results
            ? {
                songs: songs.map((s) => s.title),
                matches: results.matches,
              }
            : undefined,
      },
    }
    socket.sendAndRemember({ type: 'sync-teams', teams: [{ id: VOTER_TEAM_ID, name: 'Players', color: '#ff6a13', avatar: '🙈' }] })
    socket.sendAndRemember({ type: 'sync-round', state })
    if (stage === 'playing') socket.send({ type: 'open' })
    else socket.send({ type: 'close' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, index, status, results])

  // Everyone connected has locked this song in → move on (when auto-advance is on).
  const lockedNow = players.filter((p) => (picks[playerKey(p.name)]?.slots[index] ?? 0) > 0).length
  const everyoneIn = stage === 'playing' && players.length > 0 && lockedNow >= players.length

  function start() {
    setPicks({})
    setIndex(0)
    setStage('playing')
  }

  const next = useCallback(() => {
    if (live.current.index >= total - 1) {
      setStage('results')
      playFanfare()
    } else {
      setIndex((i) => i + 1)
    }
  }, [total])

  useEffect(() => {
    if (!everyoneIn || !autoAdvance) return
    const t = setTimeout(next, 1500)
    return () => clearTimeout(t)
  }, [everyoneIn, autoAdvance, next, index])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Enter' && live.current.stage === 'playing' && !(e.target as HTMLElement | null)?.closest('input, textarea, button, a')) {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next])

  async function copyResults() {
    if (!results) return
    const lines = [`${list?.name} — Blind Ranking`]
    for (const p of results.lists) lines.push(`${p.name}: ${orderOf(p).map((s) => songs[s].title).join(' > ')}`)
    if (results.pairs[0]) lines.push(`Most in sync: ${results.pairs[0].a} & ${results.pairs[0].b} (${Math.round(results.pairs[0].similarity * 100)}%)`)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      showToast('Results copied to clipboard!')
    } catch {
      showToast('Could not copy the results.')
    }
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
  if (!enabled) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <EmptyState icon="📱" action={<BackLink to={`/tierlists/${list.id}/present`}>Back</BackLink>}>
          Blind Ranking runs on players' phones — turn on Phone Buzz-In (and configure the buzzer Worker) first.
        </EmptyState>
      </div>
    )
  }
  if (total < MIN_SONGS) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <EmptyState icon="🎵" action={<Link to={`/tierlists/${list.id}/edit`} className="text-sm text-hardwood-400 underline">Add songs</Link>}>
          Blind Ranking needs at least {MIN_SONGS} songs in the tier list.
        </EmptyState>
      </div>
    )
  }

  const current = songs[index]

  return (
    <div className="min-h-svh court-lines">
      {stage === 'results' && <Confetti />}
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <BackLink to={`/tierlists/${list.id}/present`}>Tier list</BackLink>
          <h1 className="title-page text-center"><Icon name="eye-off" /> BLIND RANKING</h1>
          <SoundControl />
        </div>

        {stage === 'lobby' && (
          <div className="space-y-5">
            <Panel padding="md" className="space-y-4">
              <p className="text-sm text-slate-300">
                {total} songs from “{list.name}” will come up one at a time. Everyone ranks each on their phone before the next — 1 is the favorite, and
                a slot can't be changed or reused. Then we compare lists.
              </p>
              <div className="flex flex-wrap items-center gap-5">
                <JoinQrCode code={code} size={132} />
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Scan or enter the code</div>
                  <div className="font-display text-5xl tracking-[0.3em] text-white">{code}</div>
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs uppercase tracking-widest text-slate-500">On a computer? Use this link</div>
                <JoinLink code={code} />
              </div>
              <ConnectionBanner status={status} />
              <div className="flex flex-wrap gap-1.5" aria-label="Players joined">
                {players.length === 0 && <span className="text-xs text-slate-500">Nobody has joined yet.</span>}
                {players.map((p) => (
                  <span key={p.connId} className="rounded-full bg-hardwood-500/20 px-3 py-1 text-xs text-hardwood-300">
                    <Icon name="phone" /> {p.name}
                  </span>
                ))}
              </div>
            </Panel>
            <div className="flex justify-center">
              <Button size="lg" onClick={start} disabled={players.length === 0}>
                START — {players.length} {players.length === 1 ? 'PLAYER' : 'PLAYERS'} →
              </Button>
            </div>
          </div>
        )}

        {stage === 'playing' && current && (
          <div className="space-y-6 text-center">
            <div className="flex items-center justify-center gap-3 text-sm uppercase tracking-widest text-slate-500">
              <ProgressRing value={index + 1} max={total} size={52} label="songs" />
              Song {index + 1} of {total}
            </div>
            <div className="mx-auto h-56 w-56 overflow-hidden rounded-3xl bg-arena-800 shadow-2xl animate-pop-in" key={current.id}>
              {current.artworkUrl ? <img src={current.artworkUrl} alt="" className="h-full w-full object-cover" /> : <ArtPlaceholder seed={`${current.title} ${current.artist ?? ''}`} />}
            </div>
            <div>
              <div className="font-display text-5xl text-white">{current.title}</div>
              <div className="text-xl text-slate-400">{current.artist}</div>
              {current.soundcloudUrl && (
                <a href={current.soundcloudUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-hardwood-400 hover:underline">
                  ▶ Play on SoundCloud ↗
                </a>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2" aria-label="Who has locked in">
              {players.map((p) => {
                const done = (picks[playerKey(p.name)]?.slots[index] ?? 0) > 0
                return (
                  <span key={p.connId} className={`rounded-full px-4 py-1.5 text-lg ${done ? 'bg-scoreboard-green/15 text-scoreboard-green' : 'bg-arena-800 text-slate-500'}`}>
                    {done ? withIcons('🔒 ') : ''}
                    {p.name}
                  </span>
                )
              })}
            </div>
            <div className="flex flex-col items-center gap-3">
              <Button size="lg" onClick={next}>
                {index >= total - 1 ? 'SEE RESULTS →' : 'NEXT SONG →'}
              </Button>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} className="accent-hardwood-500" />
                Move on automatically when everyone has locked in
              </label>
            </div>
          </div>
        )}

        {stage === 'results' && results && (
          <div className="space-y-8">
            <div className="grid gap-3 sm:grid-cols-2">
              {results.pairs[0] && (
                <Panel padding="sm">
                  <div className="text-xs uppercase tracking-widest text-slate-500">Most in sync</div>
                  <div className="text-lg text-slate-100">
                    {results.pairs[0].a} & {results.pairs[0].b}{' '}
                    <span className="font-display text-hardwood-400">{Math.round(results.pairs[0].similarity * 100)}%</span>
                  </div>
                </Panel>
              )}
              {results.unique && (
                <Panel padding="sm">
                  <div className="text-xs uppercase tracking-widest text-slate-500">Most unique taste</div>
                  <div className="text-lg text-slate-100">
                    {results.unique.name} <span className="text-sm text-slate-500">{Math.round(results.unique.similarity * 100)}% avg match</span>
                  </div>
                </Panel>
              )}
              {results.stats.length > 0 && (() => {
                const fav = [...results.stats].sort((a, b) => a.mean - b.mean)[0]
                const split = [...results.stats].sort((a, b) => b.spread - a.spread)[0]
                return (
                  <>
                    <Panel padding="sm">
                      <div className="text-xs uppercase tracking-widest text-slate-500">Crowd favorite</div>
                      <div className="truncate text-lg text-slate-100">{songs[fav.song].title}</div>
                      <div className="text-xs text-slate-500">average slot {fav.mean.toFixed(1)}</div>
                    </Panel>
                    <Panel padding="sm">
                      <div className="text-xs uppercase tracking-widest text-slate-500">Most divisive</div>
                      <div className="truncate text-lg text-slate-100">{songs[split.song].title}</div>
                      <div className="text-xs text-slate-500">slots ranged widely (±{split.spread.toFixed(1)})</div>
                    </Panel>
                  </>
                )
              })()}
            </div>

            <section>
              <h2 className="mb-2 title-section">EVERYONE'S LIST</h2>
              <div className="overflow-x-auto rounded-xl border border-arena-600">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead className="bg-arena-800 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      {results.lists.map((p) => (
                        <th key={p.name} className="px-3 py-2 font-medium">
                          {p.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {Array.from({ length: total }, (_, slot) => (
                      <tr key={slot} className="border-t border-arena-700">
                        <td className="px-3 py-1.5 font-display text-hardwood-400">{slot + 1}</td>
                        {results.lists.map((p) => {
                          const song = orderOf(p).find((s) => p.slots[s] === slot + 1)
                          return (
                            <td key={p.name} className="max-w-40 truncate px-3 py-1.5">
                              {song === undefined ? <span className="text-slate-600">—</span> : songs[song].title}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={copyResults}><Icon name="clipboard" /> Copy results</Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Play again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
