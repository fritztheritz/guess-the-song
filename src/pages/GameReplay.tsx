import BackLink from '../components/BackLink'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getGame } from '../lib/storage/game-repository'
import { cumulativeSeries, summarizeReplay } from '../lib/history'
import EmptyState from '../components/ui/EmptyState'
import ButtonLink from '../components/ui/ButtonLink'
import Panel from '../components/ui/Panel'
import ScoreLines from '../components/ScoreLines'

// How a finished game unfolded: the score race, the moments that mattered, and every possession in
// order with what each team gained. Built from Game.history, which is logged as the game is played.
export default function GameReplay() {
  const { gameId = '' } = useParams()
  const game = useMemo(() => getGame(gameId), [gameId])
  const history = game?.history ?? []
  const series = useMemo(() => (game ? cumulativeSeries(game) : []), [game])
  const summary = useMemo(() => (game ? summarizeReplay(game) : null), [game])
  const team = (id: string) => game?.teams.find((t) => t.id === id)

  return (
    <div className="min-h-svh court-lines">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <BackLink to="/">Home</BackLink>

        {!game ? (
          <div className="mt-6">
            <EmptyState icon="🔎" action={<ButtonLink to="/" variant="primary" size="sm">Back home</ButtonLink>}>
              That game couldn't be found.
            </EmptyState>
          </div>
        ) : history.length === 0 ? (
          <div className="mt-6">
            <EmptyState icon="⏪" action={<ButtonLink to="/" variant="primary" size="sm">Back home</ButtonLink>}>
              No replay for “{game.name}” — replays are recorded as a game is played, so games from before that existed (or restarted ones)
              don't have one.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-2 space-y-8">
            <div>
              <h1 className="font-display text-4xl tracking-wide text-white">{game.name}</h1>
              <p className="text-sm text-slate-400">
                Replay · {history.length} possession{history.length === 1 ? '' : 's'}
              </p>
            </div>

            <Panel padding="md">
              <ScoreLines series={series} />
            </Panel>

            {summary && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Panel padding="sm">
                  <div className="text-xs uppercase tracking-widest text-slate-500">Lead changes</div>
                  <div className="font-display text-2xl text-hardwood-400">{summary.leadChanges}</div>
                </Panel>
                {summary.biggest && (
                  <Panel padding="sm">
                    <div className="text-xs uppercase tracking-widest text-slate-500">Biggest possession</div>
                    <div className="text-slate-100">
                      <span style={{ color: team(summary.biggest.teamId)?.color }}>{team(summary.biggest.teamId)?.name}</span> took{' '}
                      <span className="font-semibold text-hardwood-400">+{summary.biggest.points}</span> on “{summary.biggest.title}”
                    </div>
                  </Panel>
                )}
                {summary.comeback && (
                  <Panel padding="sm">
                    <div className="text-xs uppercase tracking-widest text-slate-500">Comeback</div>
                    <div className="text-slate-100">
                      <span style={{ color: team(summary.comeback.teamId)?.color }}>{team(summary.comeback.teamId)?.name}</span> won after trailing by{' '}
                      {summary.comeback.deficit}
                    </div>
                  </Panel>
                )}
                {summary.scoreless > 0 && (
                  <Panel padding="sm">
                    <div className="text-xs uppercase tracking-widest text-slate-500">Stumpers</div>
                    <div className="text-slate-100">
                      {summary.scoreless} possession{summary.scoreless === 1 ? '' : 's'} nobody scored on
                    </div>
                  </Panel>
                )}
              </div>
            )}

            {game.playerStats && game.playerStats.length > 0 && (
              <section>
                <h2 className="mb-2 font-display text-xl tracking-wide text-slate-300">MVP</h2>
                {(() => {
                  const mvp = [...game.playerStats].sort((a, b) => b.points - a.points || b.correct - a.correct)[0]
                  return (
                    <Panel padding="sm" className="flex items-center justify-between gap-3">
                      <Link to={`/players/${encodeURIComponent(mvp.name)}`} className="font-semibold text-slate-100 hover:underline">
                        ⭐ {mvp.name} <span className="text-xs font-normal text-slate-500">{mvp.teamName}</span>
                      </Link>
                      <span className="text-sm text-slate-400">
                        {mvp.points} pts · {mvp.correct} right
                      </span>
                    </Panel>
                  )
                })()}
              </section>
            )}

            <section>
              <h2 className="mb-2 font-display text-xl tracking-wide text-slate-300">POSSESSION BY POSSESSION</h2>
              <ol className="space-y-2">
                {history.map((h) => (
                  <li key={h.index}>
                    <Panel padding="sm" className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-slate-100">
                          <span className="mr-2 text-slate-500">{h.index + 1}.</span>
                          {h.title}
                        </span>
                        <span className="text-xs text-slate-500">{h.artist}</span>
                      </span>
                      <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        {Object.keys(h.gains).length === 0 ? (
                          <span className="text-xs text-slate-600">no score</span>
                        ) : (
                          Object.entries(h.gains).map(([id, pts]) => (
                            <span
                              key={id}
                              className="rounded-full px-2 py-0.5 text-xs font-semibold"
                              style={{ background: `${team(id)?.color ?? '#888'}22`, color: team(id)?.color }}
                            >
                              {team(id)?.name} {pts > 0 ? '+' : ''}
                              {pts}
                            </span>
                          ))
                        )}
                      </span>
                    </Panel>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
