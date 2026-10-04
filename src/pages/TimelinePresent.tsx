import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTimelineGame, saveTimelineGame } from '../lib/storage/timeline-repository'
import { isValidSlot, type TimelineGame } from '../types/timeline'
import { playCorrect, playFanfare, playStreak, playWrong } from '../lib/sound-effects'
import SoundControl from '../components/SoundControl'
import { betterStreak, bumpTally, streakBonus } from '../lib/streaks'
import { useTurnTimer } from '../lib/use-turn-timer'
import { useConfirm } from '../state/confirm-context'
import Scoreboard from '../components/Scoreboard'
import Confetti from '../components/Confetti'
import Button from '../components/ui/Button'
import { SCORING } from '../lib/scoring'
import { underdogBonusFor } from '../lib/awards'
import { useStoredEntity } from '../lib/use-stored-entity'

// Fixed, not host-editable — same "fixed slots" convention as Guess the Popularity.
const TIMELINE_POINTS = SCORING.timeline

interface LastResult {
  correct: boolean
  title: string
  year: number
  teamName: string
  bonus?: number
  underdog?: number
  timedOut?: boolean
}

export default function TimelinePresent() {
  const { gameId } = useParams()
  const confirm = useConfirm()
  const [game, setGame] = useStoredEntity(gameId, getTimelineGame)
  // Latest saved game, updated synchronously with setGame — the turn timer's callback
  // outlives the render it was created in, so it can't read `game` directly.
  const gameRef = useRef(game)
  useEffect(() => {
    gameRef.current = game
  })
  const [lastResult, setLastResult] = useState<LastResult | null>(null)
  const [celebrating, setCelebrating] = useState(false)

  function commitGame(next: TimelineGame) {
    gameRef.current = next
    setGame(next)
  }

  const progress = game?.progress
  const inPlay = !!game && !!progress && !progress.completed
  const currentSong = game && progress && !progress.completed ? game.songs[progress.deckIndex] : undefined
  const currentTeam = game && progress ? game.teams[progress.turnTeamIndex % game.teams.length] : undefined

  function celebrate() {
    setCelebrating(true)
    setTimeout(() => setCelebrating(false), 4000)
  }

  function placeAt(slot: number) {
    const g = gameRef.current
    if (!g || g.progress.completed) return
    const prog = g.progress
    const song = g.songs[prog.deckIndex]
    const team = g.teams[prog.turnTeamIndex % g.teams.length]
    if (!song || !team) return

    const correct = isValidSlot(prog.timeline, slot, song.year)
    const nextDeckIndex = prog.deckIndex + 1
    const completed = nextDeckIndex >= g.songs.length
    const nextTurnIndex = (prog.turnTeamIndex + 1) % g.teams.length

    if (correct) {
      const count = (prog.streaks?.[team.id] ?? 0) + 1
      const bonus = streakBonus(count)
      const underdog = underdogBonusFor(g.teams, team, g.catchUp)
      const timeline = [...prog.timeline]
      timeline.splice(slot, 0, { song, teamId: team.id })
      setLastResult({ correct: true, title: song.title, year: song.year, teamName: team.name, bonus, underdog })
      commitGame(
        saveTimelineGame({
          ...g,
          teams: g.teams.map((t) => (t.id === team.id ? { ...t, score: t.score + TIMELINE_POINTS + bonus + underdog } : t)),
          progress: {
            ...prog,
            deckIndex: nextDeckIndex,
            turnTeamIndex: nextTurnIndex,
            timeline,
            completed,
            streaks: { ...prog.streaks, [team.id]: count },
            bestStreak: betterStreak(prog.bestStreak, team.id, count),
            tally: bumpTally(prog.tally, team.id, 'right'),
          },
        }),
      )
      if (completed) {
        playFanfare()
        celebrate()
      } else if (bonus > 0) {
        playStreak()
        celebrate()
      } else {
        playCorrect()
      }
    } else {
      setLastResult({ correct: false, title: song.title, year: song.year, teamName: team.name })
      commitGame(
        saveTimelineGame({
          ...g,
          progress: {
            ...prog,
            deckIndex: nextDeckIndex,
            turnTeamIndex: nextTurnIndex,
            missed: [...prog.missed, { song, teamId: team.id }],
            completed,
            streaks: { ...prog.streaks, [team.id]: 0 },
            tally: bumpTally(prog.tally, team.id, 'wrong'),
          },
        }),
      )
      if (completed) {
        playFanfare()
        celebrate()
      } else {
        playWrong()
      }
    }
  }

  async function skipSong() {
    if (!game || !currentSong) return
    if (!(await confirm(`Skip "${currentSong.title}" without anyone placing it?`, { confirmLabel: 'Skip' }))) return
    // Re-read after the dialog — the turn timer may have moved things on in the meantime.
    const g = gameRef.current
    if (!g || g.progress.completed) return
    const prog = g.progress
    const nextDeckIndex = prog.deckIndex + 1
    const completed = nextDeckIndex >= g.songs.length
    commitGame(
      saveTimelineGame({
        ...g,
        progress: {
          ...prog,
          deckIndex: nextDeckIndex,
          missed: [...prog.missed, { song: g.songs[prog.deckIndex], teamId: '' }],
          completed,
        },
      }),
    )
    if (completed) {
      playFanfare()
      celebrate()
    }
  }

  // Out of time counts as a pass, not a miss: the same mystery song stays up and the next
  // team gets a shot at it, with no effect on anyone's streak or tally.
  function passTurn() {
    const g = gameRef.current
    if (!g || g.progress.completed) return
    const song = g.songs[g.progress.deckIndex]
    const team = g.teams[g.progress.turnTeamIndex % g.teams.length]
    setLastResult({ correct: false, title: song.title, year: song.year, teamName: team.name, timedOut: true })
    playWrong()
    commitGame(saveTimelineGame({ ...g, progress: { ...g.progress, turnTeamIndex: (g.progress.turnTeamIndex + 1) % g.teams.length } }))
  }

  const turnKey = progress ? `${progress.deckIndex}:${progress.turnTeamIndex}` : ''
  const { secondsLeft } = useTurnTimer(game?.turnTimerSeconds, turnKey, inPlay, passTurn)

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

  const prog = game.progress
  const sortedFinal = [...game.teams].sort((a, b) => b.score - a.score)
  const bestStreakTeam = prog.bestStreak ? game.teams.find((t) => t.id === prog.bestStreak!.teamId) : undefined

  function renderTimeline(interactive: boolean) {
    const items: React.ReactNode[] = []
    const slotButton = (slot: number) => (
      <button
        key={`slot-${slot}`}
        onClick={() => placeAt(slot)}
        className="flex min-h-24 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-arena-500 text-lg text-hardwood-400 hover:border-hardwood-500 hover:bg-hardwood-500/10"
        aria-label={slot === 0 ? 'Place before the first card' : `Place after card ${slot}`}
      >
        +
      </button>
    )
    prog.timeline.forEach((placement, i) => {
      if (interactive) items.push(slotButton(i))
      const team = placement.teamId ? game!.teams.find((t) => t.id === placement.teamId) : undefined
      items.push(
        <div key={`card-${placement.song.spotifyTrackId}`} className="flex w-28 shrink-0 flex-col items-center gap-1 rounded-lg border border-arena-600 bg-arena-800/70 p-2 text-center">
          <div className="scoreboard-digit font-display text-xl text-hardwood-400">{placement.song.year}</div>
          <div className="h-12 w-12 overflow-hidden rounded bg-arena-700">
            {placement.song.artworkUrl && <img src={placement.song.artworkUrl} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="w-full truncate text-[11px] text-slate-200" title={placement.song.title}>
            {placement.song.title}
          </div>
          <div className="w-full truncate text-[10px] text-slate-500">{placement.song.artist}</div>
          <div className="truncate text-[10px] font-semibold" style={{ color: team?.color ?? '#64748b' }}>
            {team ? team.name : 'Starting card'}
          </div>
        </div>,
      )
    })
    if (interactive) items.push(slotButton(prog.timeline.length))
    return <div className="flex w-full max-w-5xl flex-wrap items-stretch justify-center gap-2">{items}</div>
  }

  return (
    <div className="flex min-h-svh flex-col court-lines">
      {celebrating && <Confetti />}

      <div className="flex items-center justify-between px-6 py-4">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-300">
          ← Home
        </Link>
        <div className="text-center">
          <div className="font-display text-lg tracking-wide text-white">{game.name}</div>
          <div className="text-xs text-slate-500">
            {prog.completed ? 'Final timeline' : `Song ${prog.deckIndex} of ${game.songs.length - 1}`}
          </div>
        </div>
        <SoundControl />
      </div>

      <div className="px-6 pb-4">
        <Scoreboard teams={game.teams} compact />
      </div>

      {prog.completed ? (
        <div className="flex flex-1 flex-col items-center gap-6 overflow-y-auto px-6 py-8 text-center">
          <div className="font-display text-5xl tracking-widest text-hardwood-400">FINAL STANDINGS</div>
          <div className="space-y-2">
            {sortedFinal.map((team, i) => (
              <div key={team.id} className="flex w-96 max-w-[80vw] items-center justify-between rounded-xl border border-arena-600 bg-arena-800/70 px-5 py-3">
                <span className="font-display text-xl" style={{ color: team.color }}>
                  {i === 0 ? '🏆 ' : ''}
                  {team.avatar ? `${team.avatar} ` : ''}
                  {team.name}
                </span>
                <span className="scoreboard-digit font-display text-2xl text-slate-100">{team.score} pts</span>
              </div>
            ))}
          </div>
          {prog.bestStreak && prog.bestStreak.count >= 2 && (
            <div className="text-sm font-semibold text-scoreboard-amber">
              🔥 Best streak: {bestStreakTeam?.name} with {prog.bestStreak.count} in a row
            </div>
          )}
          {renderTimeline(false)}
          {prog.missed.length > 0 && (
            <div className="max-w-3xl space-y-1">
              <div className="text-xs uppercase tracking-widest text-slate-500">Missed / skipped</div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {prog.missed.map((m) => (
                  <span key={m.song.spotifyTrackId} className="rounded-full border border-arena-600 px-2.5 py-1 text-xs text-slate-400">
                    {m.song.title} · {m.song.year}
                  </span>
                ))}
              </div>
            </div>
          )}
          <Link to="/timeline/new" className="text-sm text-hardwood-400 hover:underline">
            Build another deck →
          </Link>
        </div>
      ) : (
        currentSong &&
        currentTeam && (
          <div className="flex flex-1 flex-col items-center gap-6 overflow-y-auto px-6 py-6">
            <div className="w-full max-w-md space-y-3 text-center">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Where does this song go?</div>
                <div className="font-display text-2xl" style={{ color: currentTeam.color }}>
                  {currentTeam.avatar ? `${currentTeam.avatar} ` : ''}
                  {currentTeam.name}'s turn
                </div>
                {secondsLeft !== null && (
                  <div className={`scoreboard-digit font-display text-3xl ${secondsLeft <= 5 ? 'animate-pulse text-scoreboard-500' : 'text-slate-300'}`}>
                    {secondsLeft}s
                  </div>
                )}
                {(prog.streaks?.[currentTeam.id] ?? 0) >= 2 && (
                  <div className="text-xs font-semibold text-scoreboard-amber">🔥 {prog.streaks![currentTeam.id]} in a row</div>
                )}
              </div>

              <div className="mx-auto flex max-w-xs items-center gap-3 rounded-xl border border-hardwood-500 bg-hardwood-500/10 p-3 text-left">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-arena-700">
                  {currentSong.artworkUrl && <img src={currentSong.artworkUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{currentSong.title}</div>
                  <div className="truncate text-sm text-slate-400">{currentSong.artist}</div>
                  {currentSong.spotifyUrl && (
                    <a href={currentSong.spotifyUrl} target="_blank" rel="noreferrer" className="text-xs text-hardwood-400 hover:underline">
                      Listen on Spotify ↗
                    </a>
                  )}
                </div>
              </div>

              {lastResult && (
                <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${lastResult.correct ? 'bg-scoreboard-green/15 text-scoreboard-green' : 'bg-scoreboard-500/15 text-scoreboard-500'}`}>
                  {lastResult.timedOut
                    ? `${lastResult.teamName}: ⏱ out of time — next team's turn`
                    : `${lastResult.teamName}: "${lastResult.title}" was ${lastResult.year} — ${
                        lastResult.correct
                          ? `✓ Correct! (+${TIMELINE_POINTS + (lastResult.bonus ?? 0) + (lastResult.underdog ?? 0)}${lastResult.bonus ? ` incl. 🔥 +${lastResult.bonus} streak` : ''}${lastResult.underdog ? ` incl. 🐕 +${lastResult.underdog} underdog` : ''})`
                          : '✗ Wrong spot'
                      }`}
                </div>
              )}
            </div>

            <p className="text-xs uppercase tracking-widest text-slate-500">Tap a + to place it</p>
            {renderTimeline(true)}

            <Button variant="outline" size="sm" onClick={() => void skipSong()}>
              Skip this song →
            </Button>
          </div>
        )
      )}
    </div>
  )
}
