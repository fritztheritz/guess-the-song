import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Game } from '../types'
import { isLyricMode, isTierGuessMode } from '../types'
import { getTournament, saveTournament } from '../lib/storage/tournament-repository'
import { getGame, listGames } from '../lib/storage/game-repository'
import { computeStandings } from '../lib/tournament-standings'
import type { Tournament } from '../types/tournament'
import GamePickerModal from '../components/GamePickerModal'
import TagInput from '../components/TagInput'
import Spinner from '../components/Spinner'

export default function TournamentBuilder() {
  const { tournamentId } = useParams()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const tagSuggestions = useMemo(
    () => Array.from(new Set(listGames().flatMap((g) => g.tags ?? []))).sort(),
    [],
  )

  useEffect(() => {
    if (!tournamentId) return
    setTournament(getTournament(tournamentId))
  }, [tournamentId])

  // Games resolve fresh on every render (not stored on the tournament itself) — a game's
  // score/progress can change after it's added, and the tournament should always reflect
  // whatever that game currently looks like rather than a stale snapshot.
  const games = useMemo<Game[]>(() => {
    if (!tournament) return []
    return tournament.gameIds.map((id) => getGame(id)).filter((g): g is Game => g !== null)
  }, [tournament])

  const standings = useMemo(() => computeStandings(games), [games])

  const availableGames = useMemo(() => {
    const usedIds = new Set(tournament?.gameIds ?? [])
    return listGames().filter((g) => !usedIds.has(g.id))
  }, [tournament])

  function persist(next: Tournament) {
    setTournament(saveTournament(next))
  }

  function renameTournament(name: string) {
    if (!tournament) return
    persist({ ...tournament, name })
  }

  function addGame(game: Game) {
    if (!tournament) return
    persist({ ...tournament, gameIds: [...tournament.gameIds, game.id] })
    setPickerOpen(false)
  }

  function removeGame(id: string) {
    if (!tournament) return
    persist({ ...tournament, gameIds: tournament.gameIds.filter((gid) => gid !== id) })
  }

  function moveGame(index: number, direction: -1 | 1) {
    if (!tournament) return
    const next = [...tournament.gameIds]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    persist({ ...tournament, gameIds: next })
  }

  function updateTags(tags: string[]) {
    if (!tournament) return
    persist({ ...tournament, tags })
  }

  if (!tournament) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 text-slate-400">
        {tournamentId ? (
          <>
            <Spinner />
            <span>Loading…</span>
          </>
        ) : (
          'Tournament not found.'
        )}
      </div>
    )
  }

  return (
    <div className="min-h-svh court-lines px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-2xl text-hardwood-400 hover:text-hardwood-300">
            ←
          </Link>
          <input
            value={tournament.name}
            onChange={(e) => renameTournament(e.target.value)}
            className="w-full bg-transparent font-display text-3xl tracking-wide text-white outline-none focus:border-b focus:border-hardwood-500"
          />
        </div>

        <div className="rounded-xl border border-arena-600 bg-arena-800/60 p-5">
          <div className="mb-3 font-display text-xl tracking-wide text-hardwood-400">STANDINGS</div>
          {standings.length === 0 ? (
            <p className="text-sm text-slate-500">
              No completed games yet — standings fill in once a game in this tournament reaches its final score.
            </p>
          ) : (
            <div className="space-y-1.5">
              {standings.map((s, i) => (
                <div key={s.name} className="flex items-center justify-between rounded-lg bg-arena-700/40 px-4 py-2">
                  <span className="font-medium" style={{ color: s.color }}>
                    {i === 0 ? '🏆 ' : ''}
                    {s.name}
                    <span className="ml-2 text-xs text-slate-500">
                      {s.gamesPlayed} game{s.gamesPlayed === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="scoreboard-digit font-display text-xl text-slate-100">{s.totalScore}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="font-display text-xl tracking-wide text-hardwood-400">GAMES</div>
            <button
              onClick={() => setPickerOpen(true)}
              className="rounded-full border border-arena-500 px-4 py-1.5 text-sm text-slate-200 hover:border-hardwood-500"
            >
              + Add Game
            </button>
          </div>

          {games.length === 0 ? (
            <p className="text-sm text-slate-500">No games added yet.</p>
          ) : (
            <div className="space-y-2">
              {games.map((game, i) => (
                <div key={game.id} className="flex items-center gap-3 rounded-xl border border-arena-600 bg-arena-800/60 p-3">
                  <div className="flex shrink-0 flex-col">
                    <button
                      onClick={() => moveGame(i, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${game.name} up`}
                      className="text-slate-500 hover:text-slate-200 disabled:opacity-20"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveGame(i, 1)}
                      disabled={i === games.length - 1}
                      aria-label={`Move ${game.name} down`}
                      className="text-slate-500 hover:text-slate-200 disabled:opacity-20"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{isLyricMode(game) ? '📝' : isTierGuessMode(game) ? '🎯' : '🎵'}</span>
                      <div className="truncate font-semibold text-slate-100">{game.name}</div>
                    </div>
                    <div className="text-sm text-slate-500">
                      {game.teams.map((t) => t.name).join(' vs ')}
                      {game.progress?.completed ? (
                        <span className="text-scoreboard-green"> · Completed</span>
                      ) : game.progress ? (
                        <span className="text-hardwood-400"> · In progress</span>
                      ) : (
                        ' · Not started'
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link to={`/games/${game.id}/edit`} className="rounded-lg border border-arena-500 px-3 py-1.5 text-sm text-slate-200 hover:border-hardwood-500">
                      Edit
                    </Link>
                    <Link to={`/games/${game.id}/present`} className="rounded-lg bg-hardwood-500 px-3 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400">
                      Present
                    </Link>
                    <button
                      onClick={() => removeGame(game.id)}
                      aria-label={`Remove ${game.name} from tournament`}
                      className="rounded-lg px-2 text-slate-500 hover:text-scoreboard-500"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Tags</div>
          <TagInput tags={tournament.tags ?? []} onChange={updateTags} suggestions={tagSuggestions} listId="tournament-tag-suggestions" />
        </div>
      </div>

      {pickerOpen && <GamePickerModal games={availableGames} onClose={() => setPickerOpen(false)} onPick={addGame} />}
    </div>
  )
}
