import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Game, SongRound, Team } from '../types'
import { getGame, saveGame } from '../lib/storage/game-repository'
import { createAudioSource, type AudioSource } from '../lib/audio'
import Scoreboard from '../components/Scoreboard'

type Phase = 'intro' | 'clue' | 'revealed' | 'final'

export default function Presentation() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState<Game | null>(null)
  const [phase, setPhase] = useState<Phase>('intro')
  const [possessionIndex, setPossessionIndex] = useState(0)
  const [clueIndex, setClueIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [shotClock, setShotClock] = useState(0)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [lastAward, setLastAward] = useState<{ teamId: string; points: number } | null>(null)

  const audioSourceRef = useRef<AudioSource | null>(null)
  const shotClockTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!gameId) return
    setGame(getGame(gameId))
  }, [gameId])

  const round: SongRound | undefined = game?.rounds[possessionIndex]

  useEffect(() => {
    audioSourceRef.current?.stop()
    audioSourceRef.current = round ? createAudioSource(round) : null
    setClueIndex(0)
    setIsPlaying(false)
    setShotClock(0)
    setPlaybackError(null)
  }, [round?.id])

  useEffect(() => {
    return () => {
      audioSourceRef.current?.stop()
      if (shotClockTimer.current) clearInterval(shotClockTimer.current)
    }
  }, [])

  const stopShotClock = useCallback(() => {
    if (shotClockTimer.current) clearInterval(shotClockTimer.current)
    shotClockTimer.current = null
  }, [])

  const playClue = useCallback(
    async (index: number) => {
      if (!round || !audioSourceRef.current || isPlaying) return
      const duration = round.clipDurations[index]
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
    const saved = saveGame(nextGame)
    setGame(saved)
  }

  function nextPossession() {
    if (!game) return
    if (possessionIndex >= game.rounds.length - 1) {
      setPhase('final')
      return
    }
    setPossessionIndex((i) => i + 1)
    setPhase('clue')
    setLastAward(null)
  }

  function prevPossession() {
    if (possessionIndex === 0) return
    audioSourceRef.current?.stop()
    stopShotClock()
    setIsPlaying(false)
    setPossessionIndex((i) => i - 1)
    setPhase('clue')
    setLastAward(null)
  }

  function restartClue() {
    if (isPlaying) return
    void playClue(clueIndex)
  }

  function exitPresentation() {
    audioSourceRef.current?.stop()
    navigate(`/games/${gameId}/edit`)
  }

  function advanceClue() {
    if (!round) return
    if (clueIndex < round.clipDurations.length - 1) {
      setClueIndex((i) => i + 1)
    } else {
      reveal()
    }
  }

  // Keyboard controls (spec §18) — active throughout presentation mode.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
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
          if (phase === 'clue') void playClue(clueIndex)
          break
        case 'Enter':
          e.preventDefault()
          if (phase === 'clue') reveal()
          else if (phase === 'revealed') nextPossession()
          break
        case 'ArrowRight':
          if (phase === 'revealed') nextPossession()
          break
        case 'ArrowLeft':
          prevPossession()
          break
        case 'KeyR':
          if (phase === 'clue') restartClue()
          break
        case 'Escape':
          exitPresentation()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, clueIndex, isPlaying, possessionIndex])

  const sortedFinal = useMemo(() => [...(game?.teams ?? [])].sort((a, b) => b.score - a.score), [game])

  if (!game) return <div className="flex min-h-svh items-center justify-center bg-arena-950 text-slate-400">Loading…</div>

  return (
    <div className="fixed inset-0 flex flex-col bg-arena-950 court-lines text-white">
      <button onClick={exitPresentation} className="absolute right-4 top-4 z-10 rounded-full bg-black/40 px-3 py-1.5 text-sm text-slate-300 hover:bg-black/60">
        ESC · Exit
      </button>

      {phase === 'intro' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center animate-pop-in">
          <div className="font-display text-5xl tracking-wide text-hardwood-400">{game.name}</div>
          <div className="text-6xl">🏀</div>
          <div className="flex gap-8 font-display text-2xl text-slate-300">
            <div>{game.rounds.length} TRACKS</div>
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
          <div className="flex w-full items-center justify-between pr-28 font-display text-lg tracking-widest text-slate-400">
            <span>{game.name.toUpperCase()}</span>
            <span>POSSESSION {possessionIndex + 1} OF {game.rounds.length}</span>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
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

            <div className="flex gap-3">
              {clueIndex < round.clipDurations.length - 1 && (
                <button onClick={advanceClue} disabled={isPlaying} className="rounded-full border border-arena-500 px-5 py-2 text-sm text-slate-300 hover:border-hardwood-500 disabled:opacity-40">
                  NEXT CLUE ({round.clipDurations[clueIndex + 1]}s)
                </button>
              )}
              <button onClick={reveal} className="rounded-full bg-scoreboard-500 px-5 py-2 text-sm font-semibold text-white hover:bg-scoreboard-500/80">
                REVEAL ANSWER
              </button>
            </div>
          </div>

          <Scoreboard teams={game.teams} compact />
        </div>
      )}

      {phase === 'revealed' && round && (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8 text-center">
          <div className="pointer-events-none absolute inset-0 bg-hardwood-500/20 animate-buzzer-flash" />
          <div className="relative z-10 font-display text-4xl tracking-widest text-scoreboard-500">BUZZER BEATER</div>

          <div className="relative z-10 h-40 w-40 overflow-hidden rounded-2xl bg-arena-800 shadow-2xl animate-pop-in">
            {round.artworkUrl && <img src={round.artworkUrl} alt="" className="h-full w-full object-cover" />}
          </div>

          <div className="relative z-10">
            <div className="font-display text-3xl text-white">{round.title}</div>
            <div className="text-slate-400">{round.artist}</div>
          </div>

          {lastAward ? (
            <div className="relative z-10 space-y-1">
              <div className="font-display text-5xl text-scoreboard-green">+{lastAward.points}</div>
              <div className="text-sm uppercase tracking-widest text-slate-400">🏀 Bucket!</div>
            </div>
          ) : (
            <div className="relative z-10 w-full max-w-sm space-y-2">
              <div className="text-sm uppercase tracking-widest text-slate-400">Who got the bucket?</div>
              <div className="flex gap-2">
                {game.teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => award(team)}
                    className="flex-1 rounded-xl border border-arena-600 bg-arena-800 py-3 font-semibold hover:border-hardwood-500"
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
            onClick={nextPossession}
            className="relative z-10 mt-2 rounded-full bg-hardwood-500 px-8 py-2.5 font-semibold text-arena-950 hover:bg-hardwood-400"
          >
            {possessionIndex >= game.rounds.length - 1 ? 'FINAL SCORE →' : 'NEXT POSSESSION →'}
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
            <button
              onClick={() => {
                const reset = saveGame({ ...game, teams: game.teams.map((t) => ({ ...t, score: 0 })) })
                setGame(reset)
                setPossessionIndex(0)
                setLastAward(null)
                setPhase('intro')
              }}
              className="rounded-full bg-hardwood-500 px-6 py-2.5 font-semibold text-arena-950 hover:bg-hardwood-400"
            >
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
