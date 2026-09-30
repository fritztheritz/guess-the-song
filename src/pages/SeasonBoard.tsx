import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { isLyricMode, isTierGuessMode } from '../types'
import { getSeason, saveSeason } from '../lib/storage/season-repository'
import { listGames } from '../lib/storage/game-repository'
import { computeStandings } from '../lib/tournament-standings'
import Spinner from '../components/Spinner'
import Panel from '../components/ui/Panel'
import { useStoredEntity } from '../lib/use-stored-entity'

export default function SeasonBoard() {
  const { seasonId } = useParams()
  const [season, setSeason] = useStoredEntity(seasonId, getSeason)

  // Membership is automatic (any completed game carrying the season's tag), not a stored
  // list — resolved fresh on every render so a newly-tagged game shows up immediately, same
  // "always reflect current reality, never a stale snapshot" call as TournamentBuilder's games.
  // Only Games carry tags (Popularity/Timeline games don't — see Home.tsx), so that's the
  // only source a season can pull from.
  const taggedGames = useMemo(() => {
    if (!season) return []
    return listGames().filter((g) => (g.tags ?? []).includes(season.tag))
  }, [season])

  const standings = useMemo(() => computeStandings(taggedGames), [taggedGames])

  function renameSeason(name: string) {
    if (!season) return
    setSeason(saveSeason({ ...season, name }))
  }

  if (!season) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 text-slate-400">
        {seasonId ? (
          <>
            <Spinner />
            <span>Loading…</span>
          </>
        ) : (
          'Season not found.'
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
          <div className="min-w-0 flex-1">
            <input
              value={season.name}
              onChange={(e) => renameSeason(e.target.value)}
              className="w-full bg-transparent font-display text-3xl tracking-wide text-white outline-none focus:border-b focus:border-hardwood-500"
            />
            <div className="mt-1 text-sm text-slate-500">
              Tag: <span className="rounded-full bg-arena-700 px-2 py-0.5 text-xs text-slate-300">{season.tag}</span>
            </div>
          </div>
        </div>

        <Panel padding="lg">
          <div className="mb-3 font-display text-xl tracking-wide text-hardwood-400">STANDINGS</div>
          {standings.length === 0 ? (
            <p className="text-sm text-slate-500">
              No completed games tagged "{season.tag}" yet — standings fill in as games finish. Tag a game with "{season.tag}" from its
              editor to add it to this season.
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
        </Panel>

        <div>
          <div className="mb-3 font-display text-xl tracking-wide text-hardwood-400">GAMES IN THIS SEASON</div>
          {taggedGames.length === 0 ? (
            <p className="text-sm text-slate-500">
              No games tagged "{season.tag}" yet. Open a game's editor and add the tag "{season.tag}" to it.
            </p>
          ) : (
            <div className="space-y-2">
              {taggedGames.map((game) => (
                <Panel key={game.id} padding="sm" className="flex items-center gap-3">
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
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
