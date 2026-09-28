import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPopularityGame, savePopularityGame } from '../lib/storage/popularity-repository'
import type { PopularityGame, PopularityTrack } from '../types/popularity'
import { playCorrect, playFanfare, playWrong, isSoundMuted, setSoundMuted } from '../lib/sound-effects'
import { useConfirm } from '../state/ConfirmContext'
import Scoreboard from '../components/Scoreboard'
import Spinner from '../components/Spinner'
import Confetti from '../components/Confetti'
import Button from '../components/ui/Button'
import TextInput from '../components/ui/TextInput'

// Fixed, not host-editable — same "fixed slots" convention as Tier Guess/Year's points
// (TIER_GUESS_TIER_POINTS etc. in HostController.tsx).
const POPULARITY_POINTS = 2

// How many filtered pool matches to show at once — same "don't dump the whole pool on
// screen" lesson as the position guess's number picker: with up to ~50 songs in the pool,
// showing all of them (even filtered) would still be clutter, so this stays capped and
// leans on typing to narrow it down instead.
const MAX_SUGGESTIONS = 8

export default function PopularityPresent() {
  const { gameId } = useParams()
  const confirm = useConfirm()
  const [game, setGame] = useState<PopularityGame | null | undefined>(undefined)
  const [guessInput, setGuessInput] = useState('')
  const [soundMuted, setSoundMutedState] = useState(() => isSoundMuted())
  const [lastResult, setLastResult] = useState<{ correct: boolean; title: string; teamName: string } | null>(null)
  const [celebrating, setCelebrating] = useState(false)

  useEffect(() => {
    if (!gameId) return
    setGame(getPopularityGame(gameId) ?? null)
  }, [gameId])

  const progress = game?.progress
  const totalRanks = game?.ranks.length ?? 0
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

  function submitGuess(track: PopularityTrack) {
    if (!game || !progress || !currentRankEntry || !currentTeam) return
    const isCorrect = track.spotifyTrackId === currentRankEntry.track.spotifyTrackId
    const nextTurnIndex = (progress.turnTeamIndex + 1) % game.teams.length

    setLastResult({ correct: isCorrect, title: track.title, teamName: currentTeam.name })
    setGuessInput('')

    if (isCorrect) {
      playCorrect()
      const nextRank = progress.currentRank + 1
      const completed = nextRank > totalRanks
      const saved = savePopularityGame({
        ...game,
        teams: game.teams.map((t) => (t.id === currentTeam.id ? { ...t, score: t.score + POPULARITY_POINTS } : t)),
        progress: {
          ...progress,
          solved: { ...progress.solved, [progress.currentRank]: { track: currentRankEntry.track, teamId: currentTeam.id } },
          attempts: [],
          currentRank: nextRank,
          turnTeamIndex: nextTurnIndex,
          completed,
        },
      })
      setGame(saved)
      if (completed) {
        playFanfare()
        setCelebrating(true)
        setTimeout(() => setCelebrating(false), 4000)
      }
    } else {
      playWrong()
      const saved = savePopularityGame({
        ...game,
        progress: {
          ...progress,
          attempts: [...progress.attempts, { teamId: currentTeam.id, title: track.title }],
          turnTeamIndex: nextTurnIndex,
        },
      })
      setGame(saved)
    }
  }

  async function revealAndSkip() {
    if (!game || !progress || !currentRankEntry) return
    if (!(await confirm(`Reveal #${progress.currentRank} without anyone scoring, and move on?`, { confirmLabel: 'Reveal & skip' }))) return
    const nextRank = progress.currentRank + 1
    const completed = nextRank > totalRanks
    const saved = savePopularityGame({
      ...game,
      progress: {
        ...progress,
        solved: { ...progress.solved, [progress.currentRank]: { track: currentRankEntry.track, teamId: '' } },
        attempts: [],
        currentRank: nextRank,
        completed,
      },
    })
    setGame(saved)
    if (completed) {
      playFanfare()
      setCelebrating(true)
      setTimeout(() => setCelebrating(false), 4000)
    }
  }

  if (game === undefined) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-arena-950 text-slate-400">
        <Spinner />
        <span>Loading…</span>
      </div>
    )
  }

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
        <button
          onClick={toggleSound}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-sm text-slate-300 hover:bg-black/60"
          aria-label={soundMuted ? 'Unmute sound effects' : 'Mute sound effects'}
        >
          {soundMuted ? '🔇' : '🔊'}
        </button>
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
              </div>

              {lastResult && (
                <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${lastResult.correct ? 'bg-scoreboard-green/15 text-scoreboard-green' : 'bg-scoreboard-500/15 text-scoreboard-500'}`}>
                  {lastResult.teamName}: "{lastResult.title}" — {lastResult.correct ? `✓ Correct! (+${POPULARITY_POINTS})` : '✗ Wrong'}
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
    </div>
  )
}
