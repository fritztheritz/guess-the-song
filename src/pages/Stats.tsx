import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listGames } from '../lib/storage/game-repository'
import { computeStandings } from '../lib/tournament-standings'
import type { Game } from '../types'
import Panel from '../components/ui/Panel'

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Panel padding="sm" className="text-center">
      <div className="scoreboard-digit font-display text-2xl text-hardwood-400">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </Panel>
  )
}

export default function Stats() {
  const [games, setGames] = useState<Game[]>([])

  useEffect(() => {
    setGames(listGames())
  }, [])

  const completed = useMemo(() => games.filter((g) => g.progress?.completed), [games])
  const standings = useMemo(() => computeStandings(games), [games])
  const totalPossessions = useMemo(() => completed.reduce((sum, g) => sum + g.rounds.length, 0), [completed])

  const topTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const g of games) (g.tags ?? []).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1))
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [games])

  // Best-of across every completed game's persisted recap — absent on games completed before
  // Game.recap existed, so this only ever reflects what's actually been recorded.
  const biggestScore = useMemo(() => {
    let best: { points: number; teamName: string; roundTitle: string; gameName: string } | null = null
    for (const g of completed) {
      const b = g.recap?.biggest
      if (b && (!best || b.points > best.points)) best = { ...b, gameName: g.name }
    }
    return best
  }, [completed])

  const fastestBuzz = useMemo(() => {
    let best: { name: string; teamName: string; ms: number; gameName: string } | null = null
    for (const g of completed) {
      const f = g.recap?.fastestBuzz
      if (f && (!best || f.ms < best.ms)) best = { ...f, gameName: g.name }
    }
    return best
  }, [completed])

  return (
    <div className="min-h-svh court-lines">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl tracking-wide text-white">STATS</h1>
            <p className="mt-1 text-sm text-slate-400">Aggregated across every completed game in this browser.</p>
          </div>
          <Link to="/" className="shrink-0 text-sm text-slate-400 underline hover:text-hardwood-400">
            ← Home
          </Link>
        </div>

        {completed.length === 0 ? (
          <Panel>
            <p className="text-sm text-slate-400">No completed games yet — finish a game to start building stats.</p>
          </Panel>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Games played" value={completed.length} />
              <StatTile label="Possessions" value={totalPossessions} />
              <StatTile label="Teams tracked" value={standings.length} />
            </div>

            <section>
              <h2 className="mb-1 font-display text-xl tracking-wide text-slate-300">TEAM LEADERBOARD</h2>
              <p className="mb-3 text-xs text-slate-500">Teams matched by name across every completed game.</p>
              <div className="space-y-2">
                {standings.map((s, i) => (
                  <Panel key={s.name} padding="sm" className="flex items-center justify-between">
                    <span className="font-medium" style={{ color: s.color }}>
                      {i === 0 ? '🏆 ' : ''}
                      {s.name}
                      <span className="ml-2 text-xs text-slate-500">
                        {s.gamesPlayed} game{s.gamesPlayed === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="scoreboard-digit font-display text-lg text-slate-100">{s.totalScore}</span>
                  </Panel>
                ))}
              </div>
            </section>

            {(biggestScore || fastestBuzz) && (
              <section>
                <h2 className="mb-3 font-display text-xl tracking-wide text-slate-300">ALL-TIME BESTS</h2>
                <div className="space-y-2">
                  {biggestScore && (
                    <Panel padding="sm" className="flex items-center justify-between gap-3">
                      <span className="shrink-0 text-sm text-slate-400">⚡ Biggest single score</span>
                      <span className="truncate text-right text-sm text-slate-200">
                        +{biggestScore.points} — {biggestScore.teamName} on "{biggestScore.roundTitle}" ({biggestScore.gameName})
                      </span>
                    </Panel>
                  )}
                  {fastestBuzz && (
                    <Panel padding="sm" className="flex items-center justify-between gap-3">
                      <span className="shrink-0 text-sm text-slate-400">🔔 Fastest buzz</span>
                      <span className="truncate text-right text-sm text-slate-200">
                        {(fastestBuzz.ms / 1000).toFixed(2)}s — {fastestBuzz.name} ({fastestBuzz.teamName}) in {fastestBuzz.gameName}
                      </span>
                    </Panel>
                  )}
                </div>
              </section>
            )}

            {topTags.length > 0 && (
              <section>
                <h2 className="mb-3 font-display text-xl tracking-wide text-slate-300">TOP TAGS</h2>
                <div className="flex flex-wrap gap-2">
                  {topTags.map(([tag, count]) => (
                    <span key={tag} className="rounded-full border border-arena-600 px-3 py-1 text-xs text-slate-300">
                      {tag} · {count}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
