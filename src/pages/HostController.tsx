import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isLyricMode, isTierGuessMode, LYRIC_HINT_LABELS, type Game, type SongRound, type Team } from '../types'
import { getGame, saveGame } from '../lib/storage/game-repository'
import { createAudioSource, type AudioSource } from '../lib/audio'
import { playBuzzer } from '../lib/sound-effects'
import { useFeatureFlag } from '../state/FeatureFlagsContext'
import { presentationChannelName, type PresentationMessage, type PresentationSnapshot, type TierGuessStage } from '../lib/presentation-sync'
import Scoreboard from '../components/Scoreboard'

type Phase = 'resume' | 'intro' | 'clue' | 'revealed' | 'final'

// Fixed, not host-editable — matches the spec this mode was built to (tier match always
// worth 1, closest position always worth 2), same "fixed slots" philosophy as Guess the
// Lyric's hint points.
const TIER_GUESS_TIER_POINTS = 1
const TIER_GUESS_POSITION_POINTS = 2

export default function HostController({ gameId }: { gameId: string }) {
  const navigate = useNavigate()
  const tierListsEnabled = useFeatureFlag('tier-lists')
  const [game, setGame] = useState<Game | null>(null)
  const [phase, setPhase] = useState<Phase>('intro')
  const [possessionIndex, setPossessionIndex] = useState(0)
  const [clueIndex, setClueIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [shotClock, setShotClock] = useState(0)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [lastAward, setLastAward] = useState<{ teamId: string; points: number } | null>(null)
  const [tierCredits, setTierCredits] = useState<Set<string>>(new Set())
  const [positionCredits, setPositionCredits] = useState<Set<string>>(new Set())
  // tierguess only: splits the reveal into three slides instead of dumping both answers on
  // screen at once — tier revealed+scored, then a "guessPosition" beat (tier is now known,
  // so players get a moment to actually guess where within it before that's revealed too),
  // then position revealed+scored.
  const [tierGuessStage, setTierGuessStage] = useState<TierGuessStage>('tier')
  const [showHelp, setShowHelp] = useState(false)
  // Host Controller / Public Display split: a second window opened via "Public Display"
  // shows a read-only, answer-free mirror of whatever's currently on screen here, synced
  // over BroadcastChannel. publicConnected only ever flips true (never back to false) —
  // detecting disconnection would need a heartbeat, and getting that wrong (flickering the
  // peek toggle) is worse than just leaving it available once a public window has shown up.
  const [publicConnected, setPublicConnected] = useState(false)
  // Off by default and only ever shown once a Public Display has connected — otherwise a
  // solo host playing single-screen would leak the answer to their own audience by peeking.
  const [peekMode, setPeekMode] = useState(false)

  const audioSourceRef = useRef<AudioSource | null>(null)
  const shotClockTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const playStartedAtRef = useRef<number | null>(null)
  const latestSnapshotRef = useRef<PresentationSnapshot | null>(null)

  useEffect(() => {
    const loaded = getGame(gameId)
    // Tier Guess rides on the tier-lists flag — see the matching check in GameBuilder.
    if (loaded && isTierGuessMode(loaded) && !tierListsEnabled) {
      navigate('/', { replace: true })
      return
    }
    setGame(loaded)
    if (loaded?.progress) {
      setPossessionIndex(Math.min(loaded.progress.possessionIndex, Math.max(0, loaded.rounds.length - 1)))
      setPhase('resume')
    } else {
      setPossessionIndex(0)
      setPhase('intro')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, tierListsEnabled])

  const round: SongRound | undefined = game?.rounds[possessionIndex]
  const isTierGuess = game ? isTierGuessMode(game) : false
  const isLyric = game ? isLyricMode(game) : false

  useEffect(() => {
    audioSourceRef.current?.stop()
    audioSourceRef.current = round && !isLyric && !isTierGuess ? createAudioSource(round) : null
    setClueIndex(0)
    setIsPlaying(false)
    setShotClock(0)
    setPlaybackError(null)
    setTierCredits(new Set())
    setPositionCredits(new Set())
    setTierGuessStage('tier')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id])

  useEffect(() => {
    return () => {
      audioSourceRef.current?.stop()
      if (shotClockTimer.current) clearInterval(shotClockTimer.current)
    }
  }, [])

  // Keep the latest snapshot available synchronously for the message handler below (which
  // is wired up once and would otherwise close over stale phase/possessionIndex/etc).
  latestSnapshotRef.current = round
    ? {
        phase,
        possessionIndex,
        clueIndex,
        tierGuessStage,
        playing: isPlaying && playStartedAtRef.current ? { duration: round.clipDurations[clueIndex] ?? 0, startedAt: playStartedAtRef.current } : null,
      }
    : null

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(presentationChannelName(gameId))
    channelRef.current = channel
    channel.onmessage = (e: MessageEvent<PresentationMessage>) => {
      if (e.data?.type === 'request-sync') {
        setPublicConnected(true)
        if (latestSnapshotRef.current) channel.postMessage({ type: 'state', snapshot: latestSnapshotRef.current })
      }
    }
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [gameId])

  useEffect(() => {
    if (!channelRef.current || !latestSnapshotRef.current) return
    channelRef.current.postMessage({ type: 'state', snapshot: latestSnapshotRef.current })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, possessionIndex, clueIndex, tierGuessStage, isPlaying])

  function openPublicDisplay() {
    const url = new URL(window.location.href)
    url.searchParams.set('display', 'public')
    window.open(url.toString(), `gts-public-${gameId}`, 'noopener')
  }

  const stopShotClock = useCallback(() => {
    if (shotClockTimer.current) clearInterval(shotClockTimer.current)
    shotClockTimer.current = null
  }, [])

  const playClue = useCallback(
    async (index: number) => {
      if (!round || !audioSourceRef.current || isPlaying) return
      const duration = round.clipDurations[index]
      playStartedAtRef.current = Date.now()
      setIsPlaying(true)
      setPlaybackError(null)
      setShotClock(duration)
      shotClockTimer.current = setInterval(() => {
        setShotClock((s) => Math.max(0, s - 0.1))
      }, 100)

      try {
        await audioSourceRef.current.play(round.clipStart, duration)
      } catch (err) {
        setPlaybackError(err instanceof Error ? err.message : 'Playback failed.')
      } finally {
        stopShotClock()
        playStartedAtRef.current = null
        setIsPlaying(false)
        setShotClock(0)
      }
    },
    [round, isPlaying, stopShotClock],
  )

  const reveal = useCallback(() => {
    audioSourceRef.current?.stop()
    stopShotClock()
    setIsPlaying(false)
    setPhase('revealed')
    setTierGuessStage('tier')
    playBuzzer()
  }, [stopShotClock])

  function award(team: Team | null) {
    if (!game || !round) return
    const points = round.points[clueIndex]
    let nextGame = game
    if (team) {
      nextGame = {
        ...game,
        teams: game.teams.map((t) => (t.id === team.id ? { ...t, score: t.score + points } : t)),
      }
      setLastAward({ teamId: team.id, points })
    } else {
      setLastAward(null)
    }
    // Recorded as soon as any score changes, not just on possession advance — otherwise
    // leaving right after awarding (before clicking "next possession") would lose the
    // fact that this game is mid-play, and reopening would look "fresh" with stale points.
    nextGame = { ...nextGame, progress: { possessionIndex, completed: false } }
    const saved = saveGame(nextGame)
    setGame(saved)
  }

  // Tier Guess scoring is unlike award() above: any number of teams can independently earn
  // each credit (everyone who got the tier right, everyone tied for closest position), so
  // these are toggles the host can tap on and back off, not a single pick-a-winner action.
  function toggleTierCredit(team: Team) {
    if (!game) return
    const isOn = tierCredits.has(team.id)
    const delta = isOn ? -TIER_GUESS_TIER_POINTS : TIER_GUESS_TIER_POINTS
    const next = new Set(tierCredits)
    if (isOn) next.delete(team.id)
    else next.add(team.id)
    setTierCredits(next)
    const saved = saveGame({
      ...game,
      teams: game.teams.map((t) => (t.id === team.id ? { ...t, score: t.score + delta } : t)),
      progress: { possessionIndex, completed: false },
    })
    setGame(saved)
  }

  function togglePositionCredit(team: Team) {
    if (!game) return
    const isOn = positionCredits.has(team.id)
    const delta = isOn ? -TIER_GUESS_POSITION_POINTS : TIER_GUESS_POSITION_POINTS
    const next = new Set(positionCredits)
    if (isOn) next.delete(team.id)
    else next.add(team.id)
    setPositionCredits(next)
    const saved = saveGame({
      ...game,
      teams: game.teams.map((t) => (t.id === team.id ? { ...t, score: t.score + delta } : t)),
      progress: { possessionIndex, completed: false },
    })
    setGame(saved)
  }

  // tierguess only: the "next" action on the reveal screen steps tier -> guessPosition ->
  // position before it actually advances to the next possession.
  function tierGuessAdvance() {
    if (tierGuessStage === 'tier') {
      setTierGuessStage('guessPosition')
      return
    }
    if (tierGuessStage === 'guessPosition') {
      setTierGuessStage('position')
      return
    }
    nextPossession()
  }

  function nextPossession() {
    if (!game) return
    if (possessionIndex >= game.rounds.length - 1) {
      setGame(saveGame({ ...game, progress: { possessionIndex, completed: true } }))
      setPhase('final')
      return
    }
    const next = possessionIndex + 1
    setGame(saveGame({ ...game, progress: { possessionIndex: next, completed: false } }))
    setPossessionIndex(next)
    setPhase('clue')
    setLastAward(null)
  }

  function prevPossession() {
    if (!game || possessionIndex === 0) return
    audioSourceRef.current?.stop()
    stopShotClock()
    setIsPlaying(false)
    const prev = possessionIndex - 1
    setGame(saveGame({ ...game, progress: { possessionIndex: prev, completed: false } }))
    setPossessionIndex(prev)
    setPhase('clue')
    setLastAward(null)
  }

  function continueGame() {
    if (!game?.progress) return
    setPhase(game.progress.completed ? 'final' : 'clue')
    setClueIndex(0)
    setLastAward(null)
  }

  function restartGame() {
    if (!game) return
    const reset = saveGame({ ...game, teams: game.teams.map((t) => ({ ...t, score: 0 })), progress: undefined })
    setGame(reset)
    setPossessionIndex(0)
    setLastAward(null)
    setPhase('intro')
  }

  function restartClue() {
    if (isPlaying) return
    void playClue(clueIndex)
  }

  function exitPresentation() {
    // Once the game has reached its final screen, every answer this playthrough has
    // already been shown on screen — no confirmation needed, and the editor is a fine
    // place to land. Before that, exiting is confirmed, and lands on Home rather than the
    // editor: the editor lists every round's title/artist/answer up front, which would
    // hand anyone still watching the remaining answers for the rest of the game.
    if (phase !== 'final') {
      if (!confirm("Exit presentation now? Make sure everyone's done watching — the game isn't finished yet.")) return
      audioSourceRef.current?.stop()
      navigate('/')
      return
    }
    audioSourceRef.current?.stop()
    navigate(`/games/${gameId}/edit`)
  }

  function advanceClue() {
    if (!round) return
    // points.length is the canonical clue count for both modes — clipDurations is unused/
    // irrelevant for lyric rounds, but always matches it for song rounds anyway.
    if (clueIndex < round.points.length - 1) {
      setClueIndex((i) => i + 1)
    } else {
      reveal()
    }
  }

  // Keyboard controls (spec §18) — active throughout presentation mode.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === '?') {
        e.preventDefault()
        setShowHelp((v) => !v)
        return
      }
      if (showHelp) {
        if (e.code === 'Escape') setShowHelp(false)
        return
      }
      if (phase === 'resume') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault()
          continueGame()
        } else if (e.code === 'Escape') {
          exitPresentation()
        }
        return
      }
      if (phase === 'intro') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault()
          setPhase('clue')
        }
        return
      }
      if (phase === 'final') {
        if (e.code === 'Escape') exitPresentation()
        return
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          if (phase === 'clue' && !isLyric && !isTierGuess) void playClue(clueIndex)
          break
        case 'Enter':
          e.preventDefault()
          if (phase === 'clue') reveal()
          else if (phase === 'revealed') (isTierGuess ? tierGuessAdvance() : nextPossession())
          break
        case 'ArrowRight':
          if (phase === 'revealed') (isTierGuess ? tierGuessAdvance() : nextPossession())
          break
        case 'ArrowLeft':
          prevPossession()
          break
        case 'KeyR':
          if (phase === 'clue' && !isLyric && !isTierGuess) restartClue()
          break
        case 'Escape':
          exitPresentation()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, clueIndex, isPlaying, possessionIndex, showHelp, isLyric, isTierGuess, tierGuessStage])

  const sortedFinal = useMemo(() => [...(game?.teams ?? [])].sort((a, b) => b.score - a.score), [game])

  // Host-only "peek" — the answer for whatever isn't otherwise on screen yet. Only rendered
  // once a Public Display is connected and the host has explicitly turned peeking on.
  function cheatSheetText(): string {
    if (!round) return ''
    if (isLyric) return `"${round.lyricAnswer || '—'}" — ${round.title} · ${round.artist}`
    if (isTierGuess) {
      const tier = game?.tierListTiers?.find((t) => t.id === round.tierId)
      if (tierGuessStage === 'guessPosition') {
        return `Position: #${(round.tierPosition ?? 0) + 1} of ${round.tierSize ?? '?'} (Tier ${tier?.name ?? '—'})`
      }
      return `Tier: ${tier?.name ?? '—'}`
    }
    return `${round.title} — ${round.artist}`
  }

  const showCheatSheet =
    peekMode && publicConnected && !!round && (phase === 'clue' || (isTierGuess && phase === 'revealed' && tierGuessStage === 'guessPosition'))

  if (!game) return <div className="flex min-h-svh items-center justify-center bg-arena-950 text-slate-400">Loading…</div>

  return (
    <div className="fixed inset-0 flex flex-col bg-arena-950 court-lines text-white">
      <div className="absolute right-4 top-4 z-20 flex flex-wrap justify-end gap-2">
        {publicConnected && (
          <button
            onClick={() => setPeekMode((v) => !v)}
            className={`rounded-full px-3 py-1.5 text-sm ${peekMode ? 'bg-hardwood-500 text-arena-950' : 'bg-black/40 text-slate-300 hover:bg-black/60'}`}
          >
            {peekMode ? '🔓 Peek: ON' : '🔒 Peek: OFF'}
          </button>
        )}
        <button onClick={openPublicDisplay} className="rounded-full bg-black/40 px-3 py-1.5 text-sm text-slate-300 hover:bg-black/60">
          🖥️ Public Display{publicConnected ? ' ✓' : ''}
        </button>
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-sm text-slate-300 hover:bg-black/60"
          aria-label="Keyboard shortcuts"
        >
          ?
        </button>
        <button onClick={exitPresentation} className="rounded-full bg-black/40 px-3 py-1.5 text-sm text-slate-300 hover:bg-black/60">
          ESC · Exit
        </button>
      </div>

      {showCheatSheet && (
        <div className="fixed bottom-4 left-4 z-20 max-w-xs rounded-xl border border-hardwood-500/50 bg-black/80 px-4 py-3 text-left shadow-xl">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-hardwood-400">🔒 Host only</div>
          <div className="text-sm text-hardwood-100">{cheatSheetText()}</div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 px-6" onClick={() => setShowHelp(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-arena-600 bg-arena-900 p-6 shadow-2xl"
          >
            <div className="mb-4 font-display text-2xl tracking-wide text-hardwood-400">KEYBOARD CONTROLS</div>
            <dl className="space-y-2 text-sm">
              {[
                ['Space', 'Play current clue'],
                ['Enter', 'Reveal answer / next possession'],
                ['→', 'Next possession'],
                ['←', 'Previous possession'],
                ['R', 'Restart current clue'],
                ['Esc', 'Exit presentation'],
                ['?', 'Toggle this help'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <dt className="rounded bg-arena-700 px-2 py-0.5 font-mono text-xs text-slate-200">{key}</dt>
                  <dd className="text-slate-400">{desc}</dd>
                </div>
              ))}
            </dl>
            <button
              onClick={() => setShowHelp(false)}
              className="mt-5 w-full rounded-full bg-hardwood-500 py-2 text-sm font-semibold text-arena-950 hover:bg-hardwood-400"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {phase === 'resume' && game.progress && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center animate-pop-in">
          <div className="font-display text-4xl tracking-wide text-hardwood-400">{game.name}</div>
          <div className="text-sm uppercase tracking-widest text-slate-500">
            {game.progress.completed
              ? 'This game already finished'
              : `In progress — Possession ${game.progress.possessionIndex + 1} of ${game.rounds.length}`}
          </div>
          <Scoreboard teams={game.teams} />
          <div className="flex gap-3">
            <button
              onClick={continueGame}
              className="rounded-full bg-hardwood-500 px-8 py-3 font-display text-xl tracking-wide text-arena-950 shadow-lg shadow-hardwood-500/20 hover:bg-hardwood-400"
            >
              {game.progress.completed ? 'VIEW FINAL SCORE' : 'CONTINUE'}
            </button>
            <button
              onClick={restartGame}
              className="rounded-full border border-arena-500 px-8 py-3 font-display text-xl tracking-wide text-slate-200 hover:border-hardwood-500"
            >
              RESTART GAME
            </button>
          </div>
        </div>
      )}

      {phase === 'intro' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center animate-pop-in">
          <div className="font-display text-5xl tracking-wide text-hardwood-400">{game.name}</div>
          <div className="text-6xl">🏀</div>
          <div className="flex gap-8 font-display text-2xl text-slate-300">
            <div>{game.rounds.length} {isLyric ? 'LYRICS' : isTierGuess ? 'SONGS' : 'TRACKS'}</div>
            <div>{game.teams.length} TEAMS</div>
            <div>1 CHAMPION</div>
          </div>
          <button
            onClick={() => setPhase('clue')}
            className="rounded-full bg-hardwood-500 px-12 py-4 font-display text-2xl tracking-wide text-arena-950 shadow-xl shadow-hardwood-500/30 hover:bg-hardwood-400"
          >
            TIP OFF
          </button>
        </div>
      )}

      {phase === 'clue' && round && (
        <div className="flex flex-1 flex-col items-center justify-between px-6 py-8">
          <div className="flex w-full items-center justify-between pr-36 font-display text-lg tracking-widest text-slate-400">
            <span>{game.name.toUpperCase()}</span>
            <span>POSSESSION {possessionIndex + 1} OF {game.rounds.length}</span>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            {isLyric ? (
              <>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Finish the lyric</div>
                <div className="font-display text-3xl tracking-wide text-white">WHAT'S THE NEXT LINE?</div>
                <div className="max-w-xl rounded-2xl border-2 border-dashed border-arena-600 bg-arena-800 px-8 py-6 text-xl italic text-hardwood-300">
                  “{round.lyricPrompt || '—'}”
                </div>

                {clueIndex === 0 ? (
                  <div className="text-xs uppercase tracking-widest text-slate-500">No hints yet — worth {round.points[0]} pts</div>
                ) : (
                  <div className="w-full max-w-md space-y-1 text-left text-sm">
                    {LYRIC_HINT_LABELS.slice(0, clueIndex).map((label, i) => {
                      const value = i === 0 ? round.artist : i === 1 ? round.playlistHint : round.title
                      return (
                        <div key={label} className="flex justify-between gap-3 rounded-lg bg-arena-800 px-3 py-1.5">
                          <span className="text-slate-500">{label}</span>
                          <span className="text-slate-200">{value || '—'}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : isTierGuess ? (
              <>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Guess the ranking</div>
                <div className="font-display text-3xl tracking-wide text-white">WHAT TIER IS IT IN?</div>

                <div className="h-40 w-40 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl">
                  {round.artworkUrl && <img src={round.artworkUrl} alt="" className="h-full w-full object-cover" />}
                </div>

                <div>
                  <div className="font-display text-2xl text-white">{round.title}</div>
                  <div className="text-slate-400">{round.artist}</div>
                  {round.soundcloudUrl && (
                    <a
                      href={round.soundcloudUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 inline-block text-sm text-hardwood-400 hover:text-hardwood-300"
                    >
                      Listen on SoundCloud ↗
                    </a>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="scoreboard-digit font-display text-7xl text-scoreboard-amber">{Math.ceil(shotClock)}</div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Shot Clock</div>

                <div className="font-display text-3xl tracking-wide text-white">WHAT'S THE TRACK?</div>

                <div className="flex h-40 w-40 items-center justify-center rounded-2xl border-2 border-dashed border-arena-600 bg-arena-800 text-5xl text-arena-600">
                  ?
                </div>

                <div className="font-display text-2xl text-hardwood-400">{round.clipDurations[clueIndex]} SECONDS</div>

                <button
                  onClick={() => playClue(clueIndex)}
                  disabled={isPlaying}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-hardwood-500 text-3xl text-arena-950 shadow-lg shadow-hardwood-500/30 disabled:opacity-50 hover:bg-hardwood-400"
                >
                  {isPlaying ? '■' : '▶'}
                </button>

                {playbackError && <div className="max-w-md text-sm text-scoreboard-500">{playbackError}</div>}
              </>
            )}

            <div className="flex gap-3">
              {!isTierGuess && clueIndex < round.points.length - 1 && (
                <button onClick={advanceClue} disabled={isPlaying} className="rounded-full border border-arena-500 px-5 py-2 text-sm text-slate-300 hover:border-hardwood-500 disabled:opacity-40">
                  {isLyric ? `NEXT HINT: ${LYRIC_HINT_LABELS[clueIndex]} (${round.points[clueIndex + 1]} pts)` : `NEXT CLUE (${round.clipDurations[clueIndex + 1]}s)`}
                </button>
              )}
              <button onClick={reveal} className="rounded-full bg-scoreboard-500 px-5 py-2 text-sm font-semibold text-white hover:bg-scoreboard-500/80">
                {isTierGuess ? 'REVEAL TIER' : 'REVEAL ANSWER'}
              </button>
            </div>
          </div>

          <Scoreboard teams={game.teams} compact />
        </div>
      )}

      {phase === 'revealed' && round && (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8 text-center">
          {/* guessPosition is a thinking beat, not a reveal moment — tier is already known and
              nothing new has been shown yet, so the flash/banner would be misleading here. */}
          {!(isTierGuess && tierGuessStage === 'guessPosition') && (
            <>
              <div className="pointer-events-none absolute inset-0 bg-hardwood-500/20 animate-buzzer-flash" />
              <div className="relative z-10 font-display text-4xl tracking-widest text-scoreboard-500">BUZZER BEATER</div>
            </>
          )}

          {isLyric ? (
            <div className="relative z-10 max-w-xl">
              <div className="font-display text-3xl italic text-white">“{round.lyricAnswer || '—'}”</div>
              <div className="mt-2 text-slate-400">
                from <span className="text-slate-200">{round.title}</span> · {round.artist}
              </div>
              {round.playlistUrl && (
                <a
                  href={round.playlistUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 inline-block text-sm text-hardwood-400 hover:text-hardwood-300"
                >
                  View Playlist on SoundCloud ↗
                </a>
              )}
            </div>
          ) : isTierGuess ? (
            <>
              <div className="relative z-10 h-32 w-32 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl animate-pop-in">
                {round.artworkUrl && <img src={round.artworkUrl} alt="" className="h-full w-full object-cover" />}
              </div>

              <div className="relative z-10">
                <div className="font-display text-2xl text-white">{round.title}</div>
                <div className="text-slate-400">{round.artist}</div>
                {round.soundcloudUrl && (
                  <a
                    href={round.soundcloudUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-block text-sm text-hardwood-400 hover:text-hardwood-300"
                  >
                    View on SoundCloud ↗
                  </a>
                )}
              </div>

              {(() => {
                const tier = game.tierListTiers?.find((t) => t.id === round.tierId)
                if (tierGuessStage === 'tier') {
                  return (
                    <div className="relative z-10 space-y-1.5">
                      <div className="text-xs uppercase tracking-[0.3em] text-slate-500">It's in tier</div>
                      <span
                        className="inline-block rounded-full px-5 py-2 font-display text-2xl text-arena-950"
                        style={{ background: tier?.color ?? '#888' }}
                      >
                        {tier?.name ?? 'Unranked'}
                      </span>
                    </div>
                  )
                }
                if (tierGuessStage === 'guessPosition') {
                  return (
                    <div className="relative z-10 space-y-3">
                      <span
                        className="inline-block rounded-full px-3 py-1 font-display text-sm text-arena-950"
                        style={{ background: tier?.color ?? '#888' }}
                      >
                        {tier?.name ?? 'Unranked'}
                      </span>
                      <div className="font-display text-3xl tracking-wide text-white">WHAT POSITION IS IT IN?</div>
                      {round.tierSize !== undefined && (
                        <div className="text-sm text-slate-400">
                          {round.tierSize} song{round.tierSize === 1 ? '' : 's'} in {tier?.name ?? 'this tier'}
                        </div>
                      )}
                    </div>
                  )
                }
                return (
                  <div className="relative z-10 space-y-1.5">
                    <div className="flex items-center justify-center gap-2">
                      <span
                        className="rounded-full px-3 py-1 font-display text-sm text-arena-950"
                        style={{ background: tier?.color ?? '#888' }}
                      >
                        {tier?.name ?? 'Unranked'}
                      </span>
                      <span className="text-xs uppercase tracking-[0.3em] text-slate-500">position</span>
                    </div>
                    {round.tierPosition !== undefined && (
                      <div className="font-display text-4xl text-white">
                        #{round.tierPosition + 1}
                        <span className="ml-2 text-lg text-slate-400">
                          of {round.tierSize ?? '?'} in {tier?.name ?? 'this tier'}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          ) : (
            <>
              <div className="relative z-10 h-40 w-40 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl animate-pop-in">
                {round.artworkUrl && <img src={round.artworkUrl} alt="" className="h-full w-full object-cover" />}
              </div>

              <div className="relative z-10">
                <div className="font-display text-3xl text-white">{round.title}</div>
                <div className="text-slate-400">{round.artist}</div>
                {round.soundcloudUrl && (
                  <a
                    href={round.soundcloudUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-block text-sm text-hardwood-400 hover:text-hardwood-300"
                  >
                    View on SoundCloud ↗
                  </a>
                )}
              </div>
            </>
          )}

          {isTierGuess ? (
            tierGuessStage === 'guessPosition' ? null : (
              <div className="relative z-10 w-full max-w-lg space-y-3">
                {tierGuessStage === 'tier' ? (
                  <div>
                    <div className="mb-1.5 text-sm uppercase tracking-widest text-slate-400">
                      Got the tier right? (+{TIER_GUESS_TIER_POINTS})
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {game.teams.map((team) => (
                        <button
                          key={team.id}
                          onClick={() => toggleTierCredit(team)}
                          className={`truncate rounded-xl border px-2 py-2.5 font-semibold ${
                            tierCredits.has(team.id) ? 'border-scoreboard-green bg-scoreboard-green/15' : 'border-arena-600 bg-arena-800 hover:border-hardwood-500'
                          }`}
                          style={{ color: team.color }}
                        >
                          {tierCredits.has(team.id) ? '✓ ' : ''}
                          {team.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-1.5 text-sm uppercase tracking-widest text-slate-400">
                      Closest to position? (+{TIER_GUESS_POSITION_POINTS})
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {game.teams.map((team) => (
                        <button
                          key={team.id}
                          onClick={() => togglePositionCredit(team)}
                          className={`truncate rounded-xl border px-2 py-2.5 font-semibold ${
                            positionCredits.has(team.id) ? 'border-scoreboard-green bg-scoreboard-green/15' : 'border-arena-600 bg-arena-800 hover:border-hardwood-500'
                          }`}
                          style={{ color: team.color }}
                        >
                          {positionCredits.has(team.id) ? '✓ ' : ''}
                          {team.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          ) : lastAward ? (
            <div className="relative z-10 space-y-1">
              <div className="font-display text-5xl text-scoreboard-green">+{lastAward.points}</div>
              <div className="text-sm uppercase tracking-widest text-slate-400">🏀 Bucket!</div>
            </div>
          ) : (
            <div className="relative z-10 w-full max-w-lg space-y-2">
              <div className="text-sm uppercase tracking-widest text-slate-400">Who got the bucket?</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {game.teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => award(team)}
                    className="truncate rounded-xl border border-arena-600 bg-arena-800 px-2 py-3 font-semibold hover:border-hardwood-500"
                    style={{ color: team.color }}
                  >
                    {team.name} +{round.points[clueIndex]}
                  </button>
                ))}
              </div>
              <button onClick={() => award(null)} className="w-full rounded-xl border border-arena-700 py-2 text-sm text-slate-500 hover:text-slate-300">
                NO SCORE
              </button>
            </div>
          )}

          <Scoreboard teams={game.teams} compact />

          <button
            onClick={isTierGuess ? tierGuessAdvance : nextPossession}
            className="relative z-10 mt-2 rounded-full bg-hardwood-500 px-8 py-2.5 font-semibold text-arena-950 hover:bg-hardwood-400"
          >
            {isTierGuess && tierGuessStage === 'tier'
              ? 'NEXT: GUESS POSITION →'
              : isTierGuess && tierGuessStage === 'guessPosition'
                ? 'REVEAL POSITION →'
                : possessionIndex >= game.rounds.length - 1
                  ? 'FINAL SCORE →'
                  : 'NEXT POSSESSION →'}
          </button>
        </div>
      )}

      {phase === 'final' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <div className="font-display text-5xl tracking-widest text-hardwood-400">FINAL SCORE</div>
          <div className="space-y-3">
            {sortedFinal.map((team, i) => (
              <div key={team.id} className="flex w-72 items-center justify-between rounded-xl border border-arena-600 bg-arena-800/70 px-5 py-3">
                <span className="font-display text-xl" style={{ color: team.color }}>
                  {i === 0 ? '🏆 ' : ''}{team.name}
                </span>
                <span className="scoreboard-digit font-display text-3xl">{team.score}</span>
              </div>
            ))}
          </div>
          <div className="font-display text-lg tracking-widest text-slate-500">GAME OVER</div>

          <div className="flex gap-3">
            <button onClick={restartGame} className="rounded-full bg-hardwood-500 px-6 py-2.5 font-semibold text-arena-950 hover:bg-hardwood-400">
              PLAY AGAIN
            </button>
            <button onClick={() => navigate(`/games/${gameId}/edit`)} className="rounded-full border border-arena-500 px-6 py-2.5 text-slate-200 hover:border-hardwood-500">
              EDIT GAME
            </button>
            <button onClick={() => navigate('/')} className="rounded-full border border-arena-500 px-6 py-2.5 text-slate-200 hover:border-hardwood-500">
              BACK TO HOME
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
