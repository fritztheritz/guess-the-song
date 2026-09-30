import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPopularityGame, savePopularityGame } from '../lib/storage/popularity-repository'
import type { PopularityGame, PopularityTrack } from '../types/popularity'
import { playBuzzIn, playCorrect, playFanfare, playStreak, playWrong, isSoundMuted, setSoundMuted } from '../lib/sound-effects'
import { BuzzerSocket } from '../lib/buzzer/buzzer-socket'
import { generateRoomCode, isBuzzerConfigured } from '../lib/buzzer/config'
import type { BuzzerPlayer } from '../lib/buzzer/protocol'
import { betterStreak, bumpTally, streakBonus } from '../lib/streaks'
import { useTurnTimer } from '../lib/use-turn-timer'
import { useConfirm } from '../state/confirm-context'
import { useFeatureFlag } from '../state/feature-flags-context'
import BuzzerPanel from '../components/BuzzerPanel'
import Scoreboard from '../components/Scoreboard'
import Confetti from '../components/Confetti'
import Button from '../components/ui/Button'
import TextInput from '../components/ui/TextInput'
import { useStoredEntity } from '../lib/use-stored-entity'

// Fixed, not host-editable — same "fixed slots" convention as Tier Guess/Year's points
// (TIER_GUESS_TIER_POINTS etc. in HostController.tsx).
const POPULARITY_POINTS = 2

// How many filtered pool matches to show at once — a backstop against a big pool (up to
// ~50 songs for a prolific artist) dumping the whole thing on screen at once, not a hard
// limit meant to bite for every artist: a smaller catalog's pool should just show in full.
const MAX_SUGGESTIONS = 20

export default function PopularityPresent() {
  const { gameId } = useParams()
  const confirm = useConfirm()
  const [game, setGame] = useStoredEntity(gameId, getPopularityGame)
  // Always the latest saved game, updated synchronously alongside setGame — the socket
  // handler and timer callbacks below outlive the render they were created in, and two
  // phone guesses landing back to back would otherwise both act on the same stale game.
  const gameRef = useRef(game)
  useEffect(() => {
    gameRef.current = game
  })
  const [guessInput, setGuessInput] = useState('')
  const [soundMuted, setSoundMutedState] = useState(() => isSoundMuted())
  const [lastResult, setLastResult] = useState<{
    correct: boolean
    title: string
    teamName: string
    bonus?: number
    timedOut?: boolean
  } | null>(null)
  const [celebrating, setCelebrating] = useState(false)

  const buzzerEnabled = useFeatureFlag('phone-buzzer') && isBuzzerConfigured()
  const buzzerSocketRef = useRef<BuzzerSocket | null>(null)
  const buzzRosterRef = useRef<BuzzerPlayer[]>([])
  const phoneGuessRef = useRef<(connId: string, trackId: string) => void>(() => {})
  const [buzzRoster, setBuzzRoster] = useState<BuzzerPlayer[]>([])
  const [buzzerConnected, setBuzzerConnected] = useState(false)
  const [buzzerPanelOpen, setBuzzerPanelOpen] = useState(false)

  function commitGame(next: PopularityGame) {
    gameRef.current = next
    setGame(next)
  }

  // Phone Buzz-In: the host page owns the room (same shape as HostController's) — phones
  // join by code, get the current turn + guess pool pushed to them, and send a pick back as
  // a `guess` naming a track id. Only accepted from the team whose turn it is.
  useEffect(() => {
    if (!buzzerEnabled || !gameRef.current) return
    let current = gameRef.current
    if (!current.buzzerRoomCode) {
      current = savePopularityGame({ ...current, buzzerRoomCode: generateRoomCode() })
      commitGame(current)
    }
    const socket = new BuzzerSocket(current.buzzerRoomCode!, 'host')
    buzzerSocketRef.current = socket
    const unsubscribe = socket.onMessage((msg) => {
      if (msg.type === 'roster') {
        buzzRosterRef.current = msg.players
        setBuzzRoster(msg.players)
      } else if (msg.type === 'guess') {
        phoneGuessRef.current(msg.connId, msg.text)
      }
    })
    socket.connect()
    setBuzzerConnected(true)
    return () => {
      unsubscribe()
      socket.close()
      buzzerSocketRef.current = null
      setBuzzerConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buzzerEnabled, game?.id])

  const progress = game?.progress
  const totalRanks = game?.ranks.length ?? 0
  const inPlay = !!game && !!progress && !progress.completed
  const currentRankEntry = game && progress && !progress.completed ? game.ranks[progress.currentRank - 1] : undefined
  const currentTeam = game && progress ? game.teams[progress.turnTeamIndex % game.teams.length] : undefined

  const attemptedTitles = useMemo(
    () => new Set((progress?.attempts ?? []).map((a) => a.title.trim().toLowerCase())),
    [progress?.attempts],
  )

  // Once a track's confirmed at some rank it can't also be the answer at a different one —
  // filtered out of future ranks' suggestions so the list doesn't offer an impossible pick.
  const solvedTrackIds = useMemo(
    () => new Set(Object.values(progress?.solved ?? {}).map((s) => s.track.spotifyTrackId)),
    [progress?.solved],
  )

  const suggestions = useMemo(() => {
    if (!game) return []
    const q = guessInput.trim().toLowerCase()
    const unsolved = game.autocompletePool.filter((t) => !solvedTrackIds.has(t.spotifyTrackId))
    const pool = q ? unsolved.filter((t) => t.title.toLowerCase().includes(q)) : unsolved
    return pool.slice(0, MAX_SUGGESTIONS)
  }, [game, guessInput, solvedTrackIds])

  function toggleSound() {
    const next = !soundMuted
    setSoundMuted(next)
    setSoundMutedState(next)
  }

  function celebrate() {
    setCelebrating(true)
    setTimeout(() => setCelebrating(false), 4000)
  }

  // Reads gameRef rather than the render's `game`, since phone guesses and the turn timer
  // both call this from callbacks that outlive the render they were created in. `fromPhone`
  // just staggers the result sound behind the buzz-in blip so the two don't smear together.
  function submitGuess(track: PopularityTrack, fromPhone = false) {
    const g = gameRef.current
    if (!g || g.progress.completed) return
    const prog = g.progress
    const rankEntry = g.ranks[prog.currentRank - 1]
    const team = g.teams[prog.turnTeamIndex % g.teams.length]
    if (!rankEntry || !team) return

    const isCorrect = track.spotifyTrackId === rankEntry.track.spotifyTrackId
    const nextTurnIndex = (prog.turnTeamIndex + 1) % g.teams.length
    const soundDelay = fromPhone ? 220 : 0
    const playResult = (fn: () => void) => (soundDelay ? setTimeout(fn, soundDelay) : fn())
    if (fromPhone) playBuzzIn()
    setGuessInput('')

    if (isCorrect) {
      const count = prog.streak?.teamId === team.id ? prog.streak.count + 1 : 1
      const bonus = streakBonus(count)
      const nextRank = prog.currentRank + 1
      const completed = nextRank > g.ranks.length
      setLastResult({ correct: true, title: track.title, teamName: team.name, bonus })
      const saved = savePopularityGame({
        ...g,
        teams: g.teams.map((t) => (t.id === team.id ? { ...t, score: t.score + POPULARITY_POINTS + bonus } : t)),
        progress: {
          ...prog,
          solved: { ...prog.solved, [prog.currentRank]: { track: rankEntry.track, teamId: team.id } },
          attempts: [],
          currentRank: nextRank,
          turnTeamIndex: nextTurnIndex,
          completed,
          streak: { teamId: team.id, count },
          bestStreak: betterStreak(prog.bestStreak, team.id, count),
          tally: bumpTally(prog.tally, team.id, 'right'),
        },
      })
      commitGame(saved)
      if (completed) {
        playResult(playFanfare)
        celebrate()
      } else if (bonus > 0) {
        playResult(playStreak)
        celebrate()
      } else {
        playResult(playCorrect)
      }
    } else {
      setLastResult({ correct: false, title: track.title, teamName: team.name })
      playResult(playWrong)
      const saved = savePopularityGame({
        ...g,
        progress: {
          ...prog,
          attempts: [...prog.attempts, { teamId: team.id, title: track.title }],
          turnTeamIndex: nextTurnIndex,
          tally: bumpTally(prog.tally, team.id, 'wrong'),
        },
      })
      commitGame(saved)
    }
  }

  async function revealAndSkip() {
    if (!game || !progress || !currentRankEntry) return
    if (!(await confirm(`Reveal #${progress.currentRank} without anyone scoring, and move on?`, { confirmLabel: 'Reveal & skip' }))) return
    // Re-read after the dialog — the turn timer or a phone guess may have moved things on.
    const g = gameRef.current
    if (!g || g.progress.completed) return
    const prog = g.progress
    const rankEntry = g.ranks[prog.currentRank - 1]
    const nextRank = prog.currentRank + 1
    const completed = nextRank > g.ranks.length
    const saved = savePopularityGame({
      ...g,
      progress: {
        ...prog,
        solved: { ...prog.solved, [prog.currentRank]: { track: rankEntry.track, teamId: '' } },
        attempts: [],
        currentRank: nextRank,
        completed,
        streak: undefined,
      },
    })
    commitGame(saved)
    if (completed) {
      playFanfare()
      celebrate()
    }
  }

  // Out of time isn't a wrong guess (nothing was picked, so nothing joins the "already
  // tried" list or the team's tally) — the turn just moves on to the next team.
  function passTurn() {
    const g = gameRef.current
    if (!g || g.progress.completed) return
    const team = g.teams[g.progress.turnTeamIndex % g.teams.length]
    setLastResult({ correct: false, title: '', teamName: team.name, timedOut: true })
    playWrong()
    commitGame(savePopularityGame({ ...g, progress: { ...g.progress, turnTeamIndex: (g.progress.turnTeamIndex + 1) % g.teams.length } }))
  }

  const turnKey = progress ? `${progress.currentRank}:${progress.turnTeamIndex}:${progress.attempts.length}` : ''
  const { secondsLeft, remainingNow } = useTurnTimer(game?.turnTimerSeconds, turnKey, inPlay, passTurn)

  useEffect(() => {
    phoneGuessRef.current = (connId, trackId) => {
      const g = gameRef.current
      if (!g || g.progress.completed) return
      const player = buzzRosterRef.current.find((p) => p.connId === connId)
      const team = g.teams[g.progress.turnTeamIndex % g.teams.length]
      if (!player || !team || player.teamId !== team.id) return
      const solved = new Set(Object.values(g.progress.solved).map((x) => x.track.spotifyTrackId))
      const tried = new Set(g.progress.attempts.map((a) => a.title.trim().toLowerCase()))
      const track = g.autocompletePool.find((t) => t.spotifyTrackId === trackId)
      if (!track || solved.has(track.spotifyTrackId) || tried.has(track.title.trim().toLowerCase())) return
      submitGuess(track, true)
    }
  })

  // Team roster for the join page — keyed on a flattened string, not the teams array, since
  // that array gets a new reference on every score change.
  const teamsKey = game?.teams.map((t) => `${t.id}:${t.name}:${t.color}:${t.avatar ?? ''}`).join('|') ?? ''
  useEffect(() => {
    const g = gameRef.current
    if (!buzzerSocketRef.current || !g) return
    buzzerSocketRef.current.sendAndRemember({
      type: 'sync-teams',
      teams: g.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, avatar: t.avatar })),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsKey, buzzerConnected])

  // Unlike the other modes there's no clue window — anyone on the turn's team can submit
  // for as long as the board's in play, so the channel is simply open until the game ends.
  useEffect(() => {
    if (!buzzerSocketRef.current) return
    buzzerSocketRef.current.sendAndRemember(inPlay ? { type: 'open' } : { type: 'close' })
  }, [inPlay, buzzerConnected])

  useEffect(() => {
    if (!buzzerSocketRef.current || !game) return
    const prog = game.progress
    const solvedIds = new Set(Object.values(prog.solved).map((x) => x.track.spotifyTrackId))
    const triedTitles = new Set(prog.attempts.map((a) => a.title.trim().toLowerCase()))
    const pool = prog.completed
      ? []
      : game.autocompletePool.filter((t) => !solvedIds.has(t.spotifyTrackId)).map((t) => ({ id: t.spotifyTrackId, title: t.title }))
    const turnTeam = game.teams[prog.turnTeamIndex % game.teams.length]
    buzzerSocketRef.current.sendAndRemember({
      type: 'sync-round',
      state: {
        gameName: game.name,
        possessionIndex: Math.max(0, prog.currentRank - 1),
        totalPossessions: game.ranks.length,
        phase: prog.completed ? 'final' : 'clue',
        mode: 'popularity',
        clueText: null,
        revealed: null,
        teams: game.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, score: t.score, avatar: t.avatar })),
        popularity: {
          rank: prog.currentRank,
          totalRanks: game.ranks.length,
          turnTeamId: turnTeam?.id ?? '',
          pool,
          tried: pool.filter((t) => triedTitles.has(t.title.trim().toLowerCase())).map((t) => t.id),
          lastResult,
          turnSecondsLeft: remainingNow(),
        },
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, lastResult, buzzerConnected])

  if (game === null) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-arena-950 text-slate-400">
        <span>Game not found.</span>
        <Link to="/" className="text-hardwood-400 hover:underline">
          ← Home
        </Link>
      </div>
    )
  }

  const sortedFinal = [...game.teams].sort((a, b) => b.score - a.score)

  return (
    <div className="flex min-h-svh flex-col court-lines">
      {celebrating && <Confetti />}

      <div className="flex items-center justify-between px-6 py-4">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-300">
          ← Home
        </Link>
        <div className="flex items-center gap-2 text-center">
          {game.artistImageUrl && <img src={game.artistImageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />}
          <div>
            <div className="font-display text-lg tracking-wide text-white">{game.name}</div>
            <div className="text-xs text-slate-500">{game.artistName}'s top {totalRanks}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {buzzerEnabled && game.buzzerRoomCode && (
            <button
              onClick={() => setBuzzerPanelOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-sm text-slate-300 hover:bg-black/60"
            >
              <span className={`h-2 w-2 rounded-full ${buzzerConnected ? 'bg-scoreboard-green' : 'bg-slate-600'}`} />
              🔔 {game.buzzerRoomCode} ({buzzRoster.length})
            </button>
          )}
        <button
          onClick={toggleSound}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-sm text-slate-300 hover:bg-black/60"
          aria-label={soundMuted ? 'Unmute sound effects' : 'Mute sound effects'}
        >
          {soundMuted ? '🔇' : '🔊'}
        </button>
        </div>
      </div>

      <div className="px-6 pb-4">
        <Scoreboard teams={game.teams} compact />
      </div>

      {progress?.completed ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8 text-center">
          <div className="font-display text-5xl tracking-widest text-hardwood-400">FINAL STANDINGS</div>
          <div className="space-y-2">
            {sortedFinal.map((team, i) => (
              <div
                key={team.id}
                className="flex w-96 max-w-[80vw] items-center justify-between rounded-xl border border-arena-600 bg-arena-800/70 px-5 py-3"
              >
                <span className="font-display text-xl" style={{ color: team.color }}>
                  {i === 0 ? '🏆 ' : ''}
                  {team.avatar ? `${team.avatar} ` : ''}
                  {team.name}
                </span>
                <span className="scoreboard-digit font-display text-2xl text-slate-100">{team.score} pts</span>
              </div>
            ))}
          </div>
          <Link to="/popularity/new" className="text-sm text-hardwood-400 hover:underline">
            Play another artist →
          </Link>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-6 overflow-y-auto px-6 py-6">
          {/* The board — every rank always visible, solved ones filled in with who got it. */}
          <div className="grid w-full max-w-3xl grid-cols-5 gap-2 sm:grid-cols-10">
            {game.ranks.map((r) => {
              const solved = progress?.solved[r.rank]
              const team = solved && solved.teamId ? game.teams.find((t) => t.id === solved.teamId) : undefined
              const isCurrent = progress?.currentRank === r.rank
              return (
                <div
                  key={r.rank}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-center ${
                    isCurrent ? 'border-hardwood-500 bg-hardwood-500/10' : 'border-arena-600 bg-arena-800/60'
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">#{r.rank}</div>
                  <div className="h-10 w-10 overflow-hidden rounded bg-arena-700">
                    {solved ? (
                      solved.track.artworkUrl ? (
                        <img src={solved.track.artworkUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-arena-500">♪</div>
                      )
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-arena-600">?</div>
                    )}
                  </div>
                  {solved && (
                    <>
                      <div className="w-full truncate text-[10px] text-slate-300" title={solved.track.title}>
                        {solved.track.title}
                      </div>
                      {team && (
                        <div className="truncate text-[9px] font-semibold" style={{ color: team.color }}>
                          {team.name}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {currentRankEntry && currentTeam && (
            <div className="w-full max-w-md space-y-4 text-center">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Rank #{progress!.currentRank}</div>
                <div className="font-display text-2xl" style={{ color: currentTeam.color }}>
                  {currentTeam.avatar ? `${currentTeam.avatar} ` : ''}
                  {currentTeam.name}'s turn
                </div>
                {secondsLeft !== null && (
                  <div className={`scoreboard-digit font-display text-3xl ${secondsLeft <= 5 ? 'animate-pulse text-scoreboard-500' : 'text-slate-300'}`}>
                    {secondsLeft}s
                  </div>
                )}
                {progress!.streak && progress!.streak.count >= 2 && (
                  <div className="text-xs font-semibold text-scoreboard-amber">
                    🔥 {game.teams.find((t) => t.id === progress!.streak!.teamId)?.name} is on a {progress!.streak.count}-rank streak
                  </div>
                )}
              </div>

              {lastResult && (
                <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${lastResult.correct ? 'bg-scoreboard-green/15 text-scoreboard-green' : 'bg-scoreboard-500/15 text-scoreboard-500'}`}>
                  {lastResult.timedOut
                    ? `${lastResult.teamName}: ⏱ out of time`
                    : `${lastResult.teamName}: "${lastResult.title}" — ${
                        lastResult.correct
                          ? `✓ Correct! (+${POPULARITY_POINTS + (lastResult.bonus ?? 0)}${lastResult.bonus ? ` incl. 🔥 +${lastResult.bonus} streak` : ''})`
                          : '✗ Wrong'
                      }`}
                </div>
              )}

              {progress!.attempts.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-widest text-slate-500">Already tried for #{progress!.currentRank}</div>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {progress!.attempts.map((a, i) => {
                      const t = game.teams.find((tm) => tm.id === a.teamId)
                      return (
                        <span
                          key={i}
                          className="rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{ background: `${t?.color ?? '#888'}22`, color: t?.color }}
                        >
                          {t?.name}: {a.title}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              <TextInput
                value={guessInput}
                onChange={(e) => setGuessInput(e.target.value)}
                placeholder={`What song does ${currentTeam.name} think it is?`}
                autoFocus
                inputSize="lg"
                className="w-full text-center"
              />

              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {suggestions.map((t) => {
                  const alreadyTried = attemptedTitles.has(t.title.trim().toLowerCase())
                  return (
                    <button
                      key={t.spotifyTrackId}
                      disabled={alreadyTried}
                      onClick={() => submitGuess(t)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left ${
                        alreadyTried
                          ? 'cursor-not-allowed border-arena-700 bg-arena-800/30 opacity-40'
                          : 'border-arena-600 bg-arena-800 hover:border-hardwood-500'
                      }`}
                    >
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-arena-700">
                        {t.artworkUrl && <img src={t.artworkUrl} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <span className="truncate text-sm text-slate-100">{t.title}</span>
                      {alreadyTried && <span className="ml-auto shrink-0 text-xs text-slate-500">already tried</span>}
                    </button>
                  )
                })}
                {suggestions.length === 0 && <p className="py-4 text-sm text-slate-500">No matches in the guess pool.</p>}
              </div>

              <Button variant="outline" size="sm" onClick={() => void revealAndSkip()}>
                No one's got it — reveal & skip →
              </Button>
            </div>
          )}
        </div>
      )}

      {buzzerPanelOpen && game.buzzerRoomCode && (
        <BuzzerPanel code={game.buzzerRoomCode} teams={game.teams} roster={buzzRoster} iced={[]} onClose={() => setBuzzerPanelOpen(false)} />
      )}
    </div>
  )
}
