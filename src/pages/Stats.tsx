import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listGames } from '../lib/storage/game-repository'
import { listPopularityGames } from '../lib/storage/popularity-repository'
import { listTimelineGames } from '../lib/storage/timeline-repository'
import { computeAccuracy, findLongestStreak, tallySources } from '../lib/guess-stats'
import { computeStandings } from '../lib/tournament-standings'
import type { Game } from '../types'
import type { PopularityGame } from '../types/popularity'
import type { TimelineGame } from '../types/timeline'
import Panel from '../components/ui/Panel'
import AwardsPanel from '../components/AwardsPanel'
import { aggregatePlayers, computeAwards } from '../lib/achievements'
import PlayerLeaderboard from '../components/PlayerLeaderboard'
import { useFeatureFlag } from '../state/feature-flags-context'

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Panel padding="sm" className="text-center">
      <div className="scoreboard-digit font-display text-2xl text-hardwood-400">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </Panel>
  )
}

export default function Stats() {
  // Read straight from storage regardless of the feature flags, same as backup export —
  // turning a game type off shouldn't make its history vanish from the stats.
  const [games] = useState<Game[]>(() => listGames())
  const [popularityGames] = useState<PopularityGame[]>(() => listPopularityGames())
  const [timelineGames] = useState<TimelineGame[]>(() => listTimelineGames())

  const completed = useMemo(() => games.filter((g) => g.progress?.completed), [games])
  const completedPopularity = useMemo(() => popularityGames.filter((g) => g.progress.completed), [popularityGames])
  const completedTimeline = useMemo(() => timelineGames.filter((g) => g.progress.completed), [timelineGames])
  const totalCompleted = completed.length + completedPopularity.length + completedTimeline.length
  const standings = useMemo(
    () => computeStandings([...games, ...popularityGames, ...timelineGames]),
    [games, popularityGames, timelineGames],
  )
  const accuracy = useMemo(() => computeAccuracy(tallySources(popularityGames, timelineGames)), [popularityGames, timelineGames])
  const longestStreak = useMemo(() => findLongestStreak(tallySources(popularityGames, timelineGames)), [popularityGames, timelineGames])
  const totalPossessions = useMemo(() => completed.reduce((sum, g) => sum + g.rounds.length, 0), [completed])

  const achievementsEnabled = useFeatureFlag('achievements')
  const awards = useMemo(() => computeAwards([...games, ...popularityGames, ...timelineGames]), [games, popularityGames, timelineGames])
  const players = useMemo(() => aggregatePlayers(games), [games])

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
            <p className="mt-1 text-sm text-slate-400">Aggregated across every completed game — quiz rounds, Guess the Popularity and Guess the Timeline — in this browser.</p>
          </div>
          <Link to="/" className="shrink-0 text-sm text-slate-400 underline hover:text-hardwood-400">
            ← Home
          </Link>
        </div>

        {totalCompleted === 0 ? (
          <Panel>
            <p className="text-sm text-slate-400">No completed games yet — finish a game to start building stats.</p>
          </Panel>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Games played" value={totalCompleted} />
              <StatTile label="Possessions" value={totalPossessions} />
              <StatTile label="Teams tracked" value={standings.length} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Quiz games" value={completed.length} />
              <StatTile label="Popularity games" value={completedPopularity.length} />
              <StatTile label="Timeline games" value={completedTimeline.length} />
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

            {achievementsEnabled && <AwardsPanel awards={awards} title="ALL-TIME AWARDS" />}
            {achievementsEnabled && <PlayerLeaderboard players={players} />}

            {(biggestScore || fastestBuzz || longestStreak) && (
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
                  {longestStreak && (
                    <Panel padding="sm" className="flex items-center justify-between gap-3">
                      <span className="shrink-0 text-sm text-slate-400">🔥 Longest streak</span>
                      <span className="truncate text-right text-sm text-slate-200">
                        {longestStreak.count} in a row — {longestStreak.teamName} in {longestStreak.gameName}
                      </span>
                    </Panel>
                  )}
                </div>
              </section>
            )}

            {accuracy.length > 0 && (
              <section>
                <h2 className="mb-1 font-display text-xl tracking-wide text-slate-300">GUESSING ACCURACY</h2>
                <p className="mb-3 text-xs text-slate-500">Right vs. wrong picks in Guess the Popularity and Guess the Timeline.</p>
                <div className="space-y-2">
                  {accuracy.map((a) => {
                    const total = a.right + a.wrong
                    return (
                      <Panel key={a.name} padding="sm" className="flex items-center justify-between">
                        <span className="font-medium" style={{ color: a.color }}>
                          {a.name}
                          <span className="ml-2 text-xs text-slate-500">
                            {a.right} right · {a.wrong} wrong
                          </span>
                        </span>
                        <span className="scoreboard-digit font-display text-lg text-slate-100">
                          {total > 0 ? Math.round((a.right / total) * 100) : 0}%
                        </span>
                      </Panel>
                    )
                  })}
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
