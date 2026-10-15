import BackLink from '../components/BackLink'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { listGames } from '../lib/storage/game-repository'
import { buildPlayerProfile } from '../lib/player-profile'
import type { Game } from '../types'
import EmptyState from '../components/ui/EmptyState'
import ButtonLink from '../components/ui/ButtonLink'
import Panel from '../components/ui/Panel'
import { PlayerTrend } from '../components/StatsCharts'
import { withIcons } from '../lib/with-icons'
import PlayerCard from '../components/PlayerCard'

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Panel padding="sm" className="text-center">
      <div className="scoreboard-digit font-display text-2xl text-hardwood-400">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-600">{hint}</div>}
    </Panel>
  )
}

// One phone player's career: totals, accuracy, best game and a game-by-game history. Players are
// matched by name across games, so this reads the same data the leaderboard row linking here does.
export default function PlayerProfile() {
  const { name = '' } = useParams()
  const [games] = useState<Game[]>(() => listGames())
  const decoded = decodeURIComponent(name)
  const profile = useMemo(() => buildPlayerProfile(games, decoded), [games, decoded])

  return (
    <div className="min-h-svh court-lines">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <BackLink to="/stats">Stats</BackLink>

        {!profile ? (
          <div className="mt-6">
            <EmptyState icon="🙋" action={<ButtonLink to="/stats" variant="primary" size="sm">Back to stats</ButtonLink>}>
              No completed games found for “{decoded}”. Players only get a profile after finishing a game on a phone.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-2 space-y-8">
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              <PlayerCard profile={profile} />
              <div>
                <h1 className="font-display text-5xl tracking-wide sm:text-6xl" style={{ color: profile.color }}>
                  {profile.name}
                </h1>
                <p className="text-sm text-slate-400">
                  #{profile.rank} of {profile.ofPlayers} on the player leaderboard · usually plays for {profile.favoriteTeam}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Games" value={String(profile.games)} hint={`${profile.wins} won with their team`} />
              <Tile label="Points" value={String(profile.points)} hint={`${profile.pointsPerGame.toFixed(1)} per game`} />
              <Tile
                label="Accuracy"
                value={profile.accuracy === null ? '—' : `${Math.round(profile.accuracy * 100)}%`}
                hint={`${profile.correct} right · ${profile.wrong} wrong`}
              />
              <Tile label="Fastest buzz" value={profile.fastestMs === undefined ? '—' : `${(profile.fastestMs / 1000).toFixed(2)}s`} hint={`${profile.buzzes} buzzes`} />
            </div>

            <PlayerTrend lines={profile.lines} />

            {profile.bestGame && (
              <section>
                <h2 className="mb-2 title-section">BEST GAME</h2>
                <Panel padding="sm" className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-slate-100">
                    {profile.bestGame.gameName}
                    <span className="ml-2 text-xs text-slate-500">{profile.bestGame.teamName}</span>
                  </span>
                  <span className="scoreboard-digit font-display text-lg text-hardwood-400">{profile.bestGame.points} pts</span>
                </Panel>
              </section>
            )}

            <section>
              <h2 className="mb-2 title-section">HISTORY</h2>
              <div className="space-y-2">
                {profile.lines.map((l) => (
                  <Panel key={l.gameId} padding="sm" className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-slate-100">
                        {l.teamWon ? withIcons('🏆 ') : ''}
                        {l.gameName}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(l.date).toLocaleDateString()} · {l.teamName} · {l.correct} right, {l.wrong} wrong
                        {l.fastestMs !== undefined ? ` · ${(l.fastestMs / 1000).toFixed(2)}s best` : ''}
                      </span>
                    </span>
                    <span className="scoreboard-digit shrink-0 font-display text-lg text-slate-100">{l.points}</span>
                  </Panel>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
