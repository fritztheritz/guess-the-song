import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import BackLink from '../components/BackLink'
import { getTierList } from '../lib/storage/tierlist-repository'
import { BuzzerSocket, type SocketStatus } from '../lib/buzzer/buzzer-socket'
import { generateRoomCode, isBuzzerConfigured } from '../lib/buzzer/config'
import type { BuzzerPlayer, PhoneRoundState } from '../lib/buzzer/protocol'
import { playerKey } from '../lib/blind-rank'
import {
  DEFAULT_PICKS,
  MAX_PICKS,
  MAX_POOL,
  MIN_PICKERS,
  MIN_PICKS,
  MIN_SONGS_TO_START,
  addToTallies,
  awardsFrom,
  buildOrder,
  canStart,
  claimedTags,
  pickers,
  picksOf,
  scoreSong,
  togglePick,
  type Claims,
  type Guess,
  type Tallies,
} from '../lib/whose-pick'
import { randomTeams } from '../lib/team-names'
import { createTeam, createEmptyRound, type Team } from '../types'
import { createAudioSource, type AudioSource } from '../lib/audio'
import { useFeatureFlag } from '../state/feature-flags-context'
import ConnectionBanner from '../components/ConnectionBanner'
import JoinLink from '../components/JoinLink'
import JoinQrCode from '../components/JoinQrCode'
import Scoreboard from '../components/Scoreboard'
import FinalPodium from '../components/FinalPodium'
import Confetti from '../components/Confetti'
import SoundControl from '../components/SoundControl'
import ArtPlaceholder from '../components/ArtPlaceholder'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Panel from '../components/ui/Panel'
import { Icon } from '../components/Icon'
import { playCorrect, playFanfare, playHorn, playWrong } from '../lib/sound-effects'
import { useWakeLock } from '../lib/use-wake-lock'
import type { TierListSong } from '../types/tierlist'

type Stage = 'lobby' | 'picking' | 'playing' | 'results'

const MIN_POOL = 6
const CLIP_SECONDS = 20
const SAVE_PREFIX = 'gts.whosepick.v1.'

interface Saved {
  stage: Stage
  code: string
  limit: number
  teams: Team[]
  claims: Claims
  order: string[]
  index: number
  revealed: boolean
  ownerTeamId?: string
  guesses: Record<string, Guess>
  tallies: Tallies
}

function loadSaved(listId: string, songs: TierListSong[]): Saved | null {
  try {
    const raw = localStorage.getItem(SAVE_PREFIX + listId)
    if (!raw) return null
    const g = JSON.parse(raw) as Saved
    const ids = new Set(songs.map((s) => s.id))
    if (!['picking', 'playing', 'results'].includes(g.stage) || !Array.isArray(g.teams) || !g.claims) return null
    if (!Object.keys(g.claims).every((id) => ids.has(id)) || !g.order.every((id) => ids.has(id))) return null
    return g
  } catch {
    return null
  }
}

function Counter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label}`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="h-11 w-11 rounded-full border border-arena-500 text-xl text-white enabled:hover:border-hardwood-500 disabled:opacity-40">
        −
      </button>
      <span className="scoreboard-digit w-10 text-center font-display text-4xl text-white" aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="h-11 w-11 rounded-full border border-arena-500 text-xl text-white enabled:hover:border-hardwood-500 disabled:opacity-40">
        +
      </button>
    </div>
  )
}

const makeTeams = (count: number): Team[] => randomTeams(count).map((t) => createTeam(t.name, t.color, t.avatar))

// Whose Pick Is This? — each friend secretly claims a few favourites from a tier list's songs (no two can claim the
// same one), then the songs play in random order and everyone names who picked each. A right guess scores for the
// guesser's team; a wrong guess from another team scores for the picker's team (they fooled the room).
export default function WhosePick() {
  const { tierListId = '' } = useParams()
  useWakeLock(true)
  const list = useMemo(() => getTierList(tierListId), [tierListId])
  const songs = useMemo(() => (list?.songs ?? []).slice(0, MAX_POOL), [list])
  const songById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs])
  const phonesAvailable = useFeatureFlag('phone-buzzer') && isBuzzerConfigured()

  const [saved] = useState(() => loadSaved(tierListId, list?.songs ?? []))
  const [stage, setStage] = useState<Stage>(saved?.stage ?? 'lobby')
  const [code] = useState(() => saved?.code ?? generateRoomCode())
  const [limit, setLimit] = useState(saved?.limit ?? DEFAULT_PICKS)
  const [teams, setTeams] = useState<Team[]>(() => saved?.teams ?? makeTeams(2))
  const [claims, setClaims] = useState<Claims>(saved?.claims ?? {})
  const [order, setOrder] = useState<string[]>(saved?.order ?? [])
  const [index, setIndex] = useState(saved?.index ?? 0)
  const [revealed, setRevealed] = useState(saved?.revealed ?? false)
  const [ownerTeamId, setOwnerTeamId] = useState<string | undefined>(saved?.ownerTeamId)
  const [guesses, setGuesses] = useState<Record<string, Guess>>(saved?.guesses ?? {})
  const [tallies, setTallies] = useState<Tallies>(saved?.tallies ?? {})
  const [players, setPlayers] = useState<BuzzerPlayer[]>([])
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const [playError, setPlayError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const socketRef = useRef<BuzzerSocket | null>(null)
  const playersRef = useRef<BuzzerPlayer[]>([])
  const audioRef = useRef<AudioSource | null>(null)
  // Where the next clip starts in the song on screen (each press plays the next 20 seconds).
  const [clip, setClip] = useState<{ id: string; at: number }>({ id: '', at: 0 })
  // The latest game state for socket handlers (which outlive any one render).
  const live = useRef({ stage, claims, limit, order, index, revealed, guesses })
  useEffect(() => {
    live.current = { stage, claims, limit, order, index, revealed, guesses }
  })

  const current = stage === 'playing' ? songById.get(order[index]) : undefined
  const owner = current ? claims[current.id] : undefined
  const options = useMemo(() => pickers(claims), [claims])
  const teamed = players.filter((p) => p.teamId !== null)

  useEffect(() => {
    try {
      if (stage === 'lobby') localStorage.removeItem(SAVE_PREFIX + tierListId)
      else localStorage.setItem(SAVE_PREFIX + tierListId, JSON.stringify({ stage, code, limit, teams, claims, order, index, revealed, ownerTeamId, guesses, tallies } satisfies Saved))
    } catch {
      // Storage unavailable — the game still works, it just won't survive a reload.
    }
  }, [tierListId, stage, code, limit, teams, claims, order, index, revealed, ownerTeamId, guesses, tallies])

  // ---- Phones: picks and guesses arrive as `guess` messages ("p:<songId>" / "g:<songId>:<option>").
  const handleGuess = useCallback(
    (connId: string, text: string) => {
      const cur = live.current
      const player = playersRef.current.find((p) => p.connId === connId)
      if (!player || player.teamId === null) return
      const t = text.trim()
      if (cur.stage === 'picking') {
        const m = /^p:(.+)$/.exec(t)
        if (!m || !songById.has(m[1])) return
        const r = togglePick(cur.claims, m[1], player, cur.limit)
        if (r.outcome === 'claimed' || r.outcome === 'released') {
          live.current.claims = r.claims // settle back-to-back taps before the next render
          setClaims(r.claims)
        }
      } else if (cur.stage === 'playing' && !cur.revealed) {
        const m = /^g:(.+):(\d+)$/.exec(t)
        const songId = cur.order[cur.index]
        const key = playerKey(player.name)
        if (!m || m[1] !== songId || cur.claims[songId]?.key === key) return
        const opts = pickers(cur.claims)
        const choice = opts[Number(m[2])]
        if (!choice) return
        setGuesses((prev) => ({ ...prev, [key]: { key, name: player.name.trim(), teamId: player.teamId as string, guessKey: choice.key } }))
      }
    },
    [songById],
  )

  useEffect(() => {
    if (!phonesAvailable || !list) return
    const socket = new BuzzerSocket(code, 'host')
    socketRef.current = socket
    const offStatus = socket.onStatus(setStatus)
    const off = socket.onMessage((msg) => {
      if (msg.type === 'roster') {
        playersRef.current = msg.players
        setPlayers(msg.players)
      } else if (msg.type === 'guess') {
        handleGuess(msg.connId, msg.text)
      } else if (msg.type === 'state' && msg.buzzState === 'closed') {
        const cur = live.current
        // The room lost its state (host just connected / room recycled) — open it again if guesses should flow.
        if (cur.stage === 'picking' || (cur.stage === 'playing' && !cur.revealed)) socket.send({ type: 'open' })
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
  }, [phonesAvailable, list, code, handleGuess])

  const clipAt = current && clip.id === current.id ? clip.at : 0
  const eligible = owner ? teamed.filter((p) => playerKey(p.name) !== owner.key).length : 0
  const answered = owner ? Object.values(guesses).filter((g) => g.key !== owner.key).length : 0
  const answerIndex = owner ? options.findIndex((o) => o.key === owner.key) : -1

  // What phones see.
  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !list) return
    let whosePick: PhoneRoundState['whosePick']
    if (stage === 'picking') {
      whosePick = { stage: 'picking', limit, pool: songs.map((s) => ({ id: s.id, title: s.title, artist: s.artist })), claimed: claimedTags(claims) }
    } else if (stage === 'playing' && current) {
      whosePick = {
        stage: revealed ? 'revealed' : 'guessing',
        song: { id: current.id, title: current.title, artist: current.artist, artworkUrl: current.artworkUrl, index, total: order.length },
        options: options.map((o) => o.name),
        answered,
        eligible,
        answer: revealed ? answerIndex : undefined,
      }
    } else if (stage === 'results') {
      whosePick = { stage: 'final' }
    }
    const state: PhoneRoundState = {
      gameName: list.name,
      possessionIndex: index,
      totalPossessions: order.length,
      phase: stage === 'results' ? 'final' : stage === 'lobby' ? 'intro' : 'clue',
      mode: 'whosepick',
      clueText: null,
      revealed: null,
      teams: teams.map((t) => ({ id: t.id, name: t.name, color: t.color, score: t.score, avatar: t.avatar })),
      whosePick,
    }
    socket.sendAndRemember({ type: 'sync-teams', teams: teams.map((t) => ({ id: t.id, name: t.name, color: t.color, avatar: t.avatar })) })
    socket.sendAndRemember({ type: 'sync-round', state })
    if (stage === 'picking' || (stage === 'playing' && !revealed)) socket.send({ type: 'open' })
    else socket.send({ type: 'close' })
  }, [stage, status, list, songs, limit, claims, current, index, order, revealed, options, answered, eligible, answerIndex, teams])

  // ---- The song on screen: a fresh audio source per song.
  useEffect(() => {
    audioRef.current?.stop()
    audioRef.current = null
    if (!current) return
    audioRef.current = createAudioSource(createEmptyRound({
      source: 'soundcloud',
      title: current.title,
      artist: current.artist,
      artworkUrl: current.artworkUrl,
      soundcloudTrackId: current.soundcloudTrackId,
      soundcloudUrn: current.soundcloudUrn,
      soundcloudUrl: current.soundcloudUrl,
      soundcloudSecretToken: current.soundcloudSecretToken,
    }))
    return () => {
      audioRef.current?.stop()
      setPlaying(false)
    }
  }, [current])

  async function playClip() {
    const src = audioRef.current
    if (!src) return
    if (playing) {
      src.stop()
      setPlaying(false)
      return
    }
    setPlayError(null)
    setPlaying(true)
    try {
      await src.play(clipAt, CLIP_SECONDS)
      setClip({ id: current?.id ?? '', at: clipAt + CLIP_SECONDS })
    } catch {
      setPlayError("Couldn't play that one here — open it on SoundCloud instead.")
    } finally {
      setPlaying(false)
    }
  }

  // ---- Flow.
  function openPicks() {
    setClaims({})
    setStage('picking')
  }

  function startGame() {
    setOrder(buildOrder(claims))
    setIndex(0)
    setRevealed(false)
    setOwnerTeamId(undefined)
    setGuesses({})
    setTallies({})
    setTeams((ts) => ts.map((t) => ({ ...t, score: 0 })))
    setStage('playing')
  }

  function reveal() {
    if (!current || !owner || revealed) return
    audioRef.current?.stop()
    const ownerPlayer = players.find((p) => playerKey(p.name) === owner.key)
    const teamId = ownerPlayer?.teamId ?? undefined
    const score = scoreSong({ key: owner.key, teamId }, Object.values(guesses))
    setTeams((ts) => ts.map((t) => ({ ...t, score: t.score + (score.gains[t.id] ?? 0) })))
    setTallies((prev) => addToTallies(prev, owner, score))
    setOwnerTeamId(teamId)
    setRevealed(true)
    playHorn()
    if (score.right.length > 0) playCorrect()
    else playWrong()
  }

  function next() {
    if (index >= order.length - 1) {
      setStage('results')
      playFanfare()
      return
    }
    setIndex(index + 1)
    setRevealed(false)
    setOwnerTeamId(undefined)
    setGuesses({})
  }

  function playAgain() {
    setClaims({})
    setOrder([])
    setGuesses({})
    setTallies({})
    setIndex(0)
    setRevealed(false)
    setTeams((ts) => ts.map((t) => ({ ...t, score: 0 })))
    setStage('lobby')
  }

  function changeTeamCount(n: number) {
    setTeams((ts) => (n <= ts.length ? ts.slice(0, n) : [...ts, ...makeTeams(n).slice(ts.length)]))
  }

  if (!list) {
    return (
      <div className="min-h-svh court-lines px-6 py-16">
        <div className="mx-auto max-w-md">
          <EmptyState icon="🔎" action={<BackLink to="/">Back home</BackLink>}>
            That tier list couldn't be found.
          </EmptyState>
        </div>
      </div>
    )
  }

  const blocker = !phonesAvailable
    ? 'This game needs phones — turn on the Phone Buzz-In feature flag and connect the room server first.'
    : songs.length < MIN_POOL
      ? `Whose Pick needs at least ${MIN_POOL} songs in the list (this one has ${songs.length}).`
      : null

  const teamName = (id?: string) => teams.find((t) => t.id === id)
  const awards = awardsFrom(tallies)
  const startable = canStart(claims)
  const rosterByTeam = teams.map((t) => ({ team: t, members: teamed.filter((p) => p.teamId === t.id) }))
  const pickProgress = (name: string) => picksOf(claims, playerKey(name)).length

  return (
    <div className="min-h-svh court-lines">
      {stage === 'results' && <Confetti />}
      <div className="mx-auto max-w-4xl px-4 pb-10 sm:px-6">
        <div className="flex items-center justify-between gap-3 py-5">
          <BackLink to={`/tierlists/${list.id}/present`}>Tier list</BackLink>
          <h1 className="title-page text-center">
            <Icon name="eye" /> WHOSE PICK?
          </h1>
          <SoundControl />
        </div>

        {blocker ? (
          <div className="mx-auto max-w-md">
            <EmptyState icon="📱" action={<BackLink to={`/tierlists/${list.id}/present`}>Back</BackLink>}>
              {blocker}
            </EmptyState>
          </div>
        ) : (
          <>
            {stage === 'lobby' && (
              <div className="mx-auto max-w-2xl space-y-4">
                <Panel padding="md" className="space-y-5">
                  <p className="text-sm text-slate-300">
                    Everyone secretly picks {limit === 1 ? 'a favorite' : `${limit} favorites`} from “{list.name}” on their phone — nobody can take the same song. Then the songs play in
                    random order and the room guesses which friend picked each one. Right guess: a point for your team. Fool another team: a point for yours.
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-arena-600 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Picks each</div>
                      <div className="text-xs text-slate-500">{songs.length} songs to choose from</div>
                    </div>
                    <Counter label="picks each" value={limit} min={MIN_PICKS} max={Math.min(MAX_PICKS, Math.floor(songs.length / 2))} onChange={setLimit} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-arena-600 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Teams</div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {teams.map((t) => (
                          <span key={t.id} className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: `${t.color}33`, color: t.color }}>
                            {t.avatar} {t.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Counter label="teams" value={teams.length} min={2} max={4} onChange={changeTeamCount} />
                      <button type="button" onClick={() => setTeams(makeTeams(teams.length))} className="text-xs text-slate-400 underline hover:text-white">
                        Shuffle names
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3 rounded-xl border border-arena-600 p-4">
                    <div className="flex flex-wrap items-center gap-5">
                      <JoinQrCode code={code} size={110} />
                      <div>
                        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Scan or enter the code</div>
                        <div className="font-display text-4xl tracking-[0.3em] text-white">{code}</div>
                      </div>
                    </div>
                    <JoinLink code={code} />
                    <ConnectionBanner status={status} />
                    <div className="space-y-1.5" aria-label="Players joined">
                      {teamed.length === 0 && <span className="text-xs text-slate-500">Nobody has joined yet — everyone picks a team when they join.</span>}
                      {rosterByTeam.map(({ team, members }) =>
                        members.length === 0 ? null : (
                          <div key={team.id} className="flex flex-wrap items-center gap-1.5">
                            <span className="w-28 truncate text-xs font-semibold" style={{ color: team.color }}>
                              {team.avatar} {team.name}
                            </span>
                            {members.map((p) => (
                              <span key={p.connId} className="rounded-full bg-arena-700 px-2.5 py-1 text-xs text-slate-200">
                                {p.name}
                              </span>
                            ))}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </Panel>
                <div className="flex flex-col items-center gap-1">
                  <Button size="lg" onClick={openPicks} disabled={teamed.length < MIN_PICKERS}>
                    OPEN PICKS →
                  </Button>
                  {teamed.length < MIN_PICKERS && <span className="text-xs text-slate-500">Needs at least {MIN_PICKERS} players with a team.</span>}
                </div>
              </div>
            )}

            {stage === 'picking' && (
              <div className="mx-auto max-w-2xl space-y-4">
                <Panel padding="md" className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-display text-3xl tracking-wide text-white">PICKS ARE OPEN</div>
                      <div className="text-sm text-slate-400">
                        Everyone's choosing {limit === 1 ? 'a favorite' : `${limit} favorites`} on their phone. Room <span className="font-mono text-slate-200">{code}</span>.
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-4xl text-hardwood-400">{Object.keys(claims).length}</div>
                      <div className="text-xs uppercase tracking-widest text-slate-500">songs claimed</div>
                    </div>
                  </div>
                  <ConnectionBanner status={status} />
                  <ul className="space-y-1.5" aria-label="Pick progress">
                    {teamed.length === 0 && <li className="text-sm text-slate-500">Waiting for players to join…</li>}
                    {teamed.map((p) => {
                      const n = pickProgress(p.name)
                      const team = teams.find((t) => t.id === p.teamId)
                      return (
                        <li key={p.connId} className="flex items-center gap-3 rounded-lg bg-arena-700/40 px-3 py-1.5">
                          <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                            {p.name}
                            <span className="ml-2 text-xs" style={{ color: team?.color }}>
                              {team?.name}
                            </span>
                          </span>
                          <span className="flex gap-1" aria-label={`${n} of ${limit} picked`}>
                            {Array.from({ length: limit }, (_, i) => (
                              <span key={i} className={`h-2.5 w-6 rounded-sm ${i < n ? 'bg-hardwood-500' : 'bg-arena-600'}`} />
                            ))}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </Panel>
                <div className="flex flex-col items-center gap-1">
                  <Button size="lg" onClick={startGame} disabled={!startable}>
                    START THE GAME →
                  </Button>
                  {!startable && (
                    <span className="text-xs text-slate-500">
                      Needs {MIN_SONGS_TO_START}+ songs claimed by at least {MIN_PICKERS} people.
                    </span>
                  )}
                </div>
              </div>
            )}

            {stage === 'playing' && current && owner && (
              <div className="space-y-5">
                <div className="sticky top-0 z-10 pb-1 pt-2">
                  <Panel padding="sm" className="ticket flex flex-wrap items-center gap-4 !bg-arena-800 px-6">
                    <div key={current.id} className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-arena-800 animate-pop-in sm:h-24 sm:w-24">
                      {current.artworkUrl ? <img src={current.artworkUrl} alt="" className="h-full w-full object-cover" /> : <ArtPlaceholder seed={`${current.title} ${current.artist}`} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs uppercase tracking-widest text-slate-500">
                        Song {index + 1} of {order.length}
                        {!revealed && eligible > 0 && ` · ${answered} of ${eligible} answered`}
                      </div>
                      <div className="truncate font-display text-3xl text-white sm:text-4xl">{current.title}</div>
                      <div className="truncate text-lg text-slate-400">{current.artist}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                        <button type="button" onClick={playClip} className="rounded-full border border-hardwood-500 px-3 py-1 font-semibold text-hardwood-400 hover:bg-hardwood-500/10">
                          {playing ? '■ Stop' : `▶ Play ${Math.floor(clipAt / 60)}:${String(clipAt % 60).padStart(2, '0')}`}
                        </button>
                        {current.soundcloudUrl && (
                          <a href={current.soundcloudUrl} target="_blank" rel="noopener noreferrer" className="text-hardwood-400 hover:underline">
                            Open on SoundCloud ↗
                          </a>
                        )}
                      </div>
                      {playError && <div className="mt-1 text-xs text-scoreboard-500">{playError}</div>}
                    </div>
                    <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:border-l-2 sm:border-dashed sm:border-arena-500 sm:pl-4">
                      {revealed ? (
                        <Button size="lg" onClick={next}>
                          {index >= order.length - 1 ? 'SEE RESULTS →' : 'NEXT SONG →'}
                        </Button>
                      ) : (
                        <Button size="lg" onClick={reveal}>
                          REVEAL
                        </Button>
                      )}
                    </div>
                  </Panel>
                </div>

                {!revealed ? (
                  <Panel padding="md" className="text-center">
                    <div className="font-display text-3xl tracking-wide text-white">WHOSE PICK IS THIS?</div>
                    <div className="mt-1 text-sm text-slate-400">Everyone's naming a friend on their phone. Reveal when the room has had its say.</div>
                    <div className="mt-3 flex flex-wrap justify-center gap-2" aria-label="Who it could be">
                      {options.map((o) => (
                        <span key={o.key} className="rounded-full border border-arena-500 px-4 py-1.5 font-display text-xl text-slate-200">
                          {o.name}
                        </span>
                      ))}
                    </div>
                  </Panel>
                ) : (
                  <RevealPanel ownerName={owner.name} ownerTeam={teamName(ownerTeamId)} score={scoreSong({ key: owner.key, teamId: ownerTeamId }, Object.values(guesses))} teams={teams} />
                )}

                <Scoreboard teams={teams} />
              </div>
            )}

            {stage === 'results' && (
              <div className="flex flex-col items-center gap-6 text-center">
                <div className="font-display text-5xl tracking-widest text-hardwood-400">FINAL SCORE</div>
                <FinalPodium teams={teams} />
                <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
                  <Panel padding="md" className="text-left">
                    <div className="text-xs uppercase tracking-widest text-slate-500">Best detective</div>
                    <div className="font-display text-3xl text-hardwood-400">{awards.detective ? awards.detective.name : '—'}</div>
                    <div className="text-sm text-slate-400">{awards.detective ? `${awards.detective.correct} right ${awards.detective.correct === 1 ? 'guess' : 'guesses'}` : 'Nobody guessed right.'}</div>
                  </Panel>
                  <Panel padding="md" className="text-left">
                    <div className="text-xs uppercase tracking-widest text-slate-500">Master of disguise</div>
                    <div className="font-display text-3xl text-hardwood-400">{awards.disguise ? awards.disguise.name : '—'}</div>
                    <div className="text-sm text-slate-400">{awards.disguise ? `Fooled ${awards.disguise.fooled} ${awards.disguise.fooled === 1 ? 'guess' : 'guesses'} from other teams` : 'Nobody was fooled.'}</div>
                  </Panel>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button onClick={playAgain}>PLAY AGAIN</Button>
                  <Button variant="outline" onClick={() => (window.location.href = import.meta.env.BASE_URL)}>
                    Home
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function RevealPanel({ ownerName, ownerTeam, score, teams }: { ownerName: string; ownerTeam?: Team; score: ReturnType<typeof scoreSong>; teams: Team[] }) {
  const gains = Object.entries(score.gains).filter(([, n]) => n > 0)
  return (
    <Panel padding="md" className="space-y-4 text-center">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">It was the pick of</div>
        <div className="animate-reveal-pop font-display text-6xl tracking-wide" style={{ color: ownerTeam?.color ?? '#fff' }}>
          {ownerName}
        </div>
        {ownerTeam && (
          <div className="text-sm text-slate-400">
            {ownerTeam.avatar} {ownerTeam.name}
          </div>
        )}
      </div>
      <div className="grid gap-3 text-left sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-scoreboard-green">
            <Icon name="check" /> Got it ({score.right.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {score.right.length === 0 && <span className="text-sm text-slate-500">Nobody.</span>}
            {score.right.map((g) => (
              <span key={g.key} className="rounded-full bg-scoreboard-green/15 px-3 py-1 text-sm text-scoreboard-green">
                {g.name}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-scoreboard-500">
            <Icon name="x" /> Fooled ({score.wrong.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {score.wrong.length === 0 && <span className="text-sm text-slate-500">Nobody.</span>}
            {score.wrong.map((g) => (
              <span key={g.key} className="rounded-full bg-scoreboard-500/15 px-3 py-1 text-sm text-scoreboard-500">
                {g.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      {gains.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2" aria-label="Points this song">
          {gains.map(([id, n]) => {
            const t = teams.find((x) => x.id === id)
            return (
              <span key={id} className="rounded-full px-3 py-1 font-display text-xl" style={{ background: `${t?.color}33`, color: t?.color }}>
                +{n} {t?.name}
              </span>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
