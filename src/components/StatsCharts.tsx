import type { WeekBucket, WinRate } from '../lib/stats-charts'
import type { PlayerGameLine } from '../lib/player-profile'
import { Icon } from './Icon'
import { withIcons } from '../lib/with-icons'

// Small, dependency-free charts for Stats and player profiles. Each carries a text alternative
// (title / aria-label) so the numbers aren't only conveyed by shape and colour.

/** Win rate per team: a bar filled to the share of games won, with "wins of games" beside it. */
export function WinRateChart({ rows }: { rows: WinRate[] }) {
  if (rows.length === 0) return null
  return (
    <section>
      <h2 className="mb-1 title-section">WIN RATE</h2>
      <p className="mb-3 text-xs text-slate-500">Outright wins in finished games — a tie for first doesn't count.</p>
      <ul className="space-y-2">
        {rows.slice(0, 8).map((r) => {
          const pct = Math.round((r.wins / r.games) * 100)
          return (
            <li key={r.name} className="flex items-center gap-3 text-sm" title={`${r.name}: ${r.wins} wins in ${r.games} games`}>
              <span className="w-24 shrink-0 truncate font-medium" style={{ color: r.color }}>
                {r.name}
              </span>
              <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-arena-800" role="img" aria-label={`${pct}% win rate`}>
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(pct, r.wins > 0 ? 4 : 0)}%`, background: r.color }} />
              </span>
              <span className="w-20 shrink-0 text-right text-xs text-slate-400">
                <span className="scoreboard-digit font-display text-base text-slate-100">{pct}%</span> · {r.wins}/{r.games}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const HEAT = ['bg-arena-800', 'bg-hardwood-500/30', 'bg-hardwood-500/55', 'bg-hardwood-500/80', 'bg-hardwood-400']

/** One square per week, darker the more games were finished that week — a streak calendar. */
export function ActivityStrip({ weeks }: { weeks: WeekBucket[] }) {
  const total = weeks.reduce((n, w) => n + w.count, 0)
  if (total === 0) return null
  const max = Math.max(...weeks.map((w) => w.count))
  // Consecutive weeks with at least one game, counting back from the latest.
  let streak = 0
  for (let i = weeks.length - 1; i >= 0 && weeks[i].count > 0; i--) streak++
  return (
    <section>
      <h2 className="mb-1 title-section">GAME NIGHTS</h2>
      <p className="mb-3 text-xs text-slate-500">
        {total} finished {total === 1 ? 'game' : 'games'} in the last {weeks.length} weeks
        {streak > 1 ? withIcons(` · ${streak}-week streak 🔥`) : ''}
      </p>
      <div className="flex gap-1.5" role="img" aria-label={`Games finished per week over the last ${weeks.length} weeks: ${weeks.map((w) => w.count).join(', ')}`}>
        {weeks.map((w) => {
          const level = w.count === 0 ? 0 : Math.max(1, Math.ceil((w.count / max) * (HEAT.length - 1)))
          return (
            <div
              key={w.start}
              title={`Week of ${w.start}: ${w.count} ${w.count === 1 ? 'game' : 'games'}`}
              className={`aspect-square min-w-0 flex-1 rounded-md border border-arena-700 ${HEAT[level]}`}
            />
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{weeks[0].start}</span>
        <span>this week</span>
      </div>
    </section>
  )
}

/** A player's points in each game, oldest to newest, with the games their team won marked. */
export function PlayerTrend({ lines }: { lines: PlayerGameLine[] }) {
  if (lines.length < 2) return null
  const ordered = [...lines].reverse().slice(-12)
  const max = Math.max(1, ...ordered.map((l) => l.points))
  return (
    <section>
      <h2 className="mb-1 title-section">POINTS PER GAME</h2>
      <p className="mb-3 text-xs text-slate-500">Last {ordered.length} games, oldest to newest. <Icon name="trophy" /> = their team won.</p>
      <div className="flex items-end gap-2 rounded-xl border border-arena-700 bg-arena-900/50 px-4 pb-3 pt-6" role="img" aria-label={`Points per game: ${ordered.map((l) => l.points).join(', ')}`}>
        {ordered.map((l) => (
          <div key={l.gameId} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${l.gameName}: ${l.points} pts`}>
            <span className="text-xs text-slate-400">{l.teamWon ? withIcons('🏆') : ''}</span>
            <div className="flex h-24 w-full items-end">
              <div className={`w-full rounded-t ${l.teamWon ? 'bg-hardwood-400' : 'bg-hardwood-500/60'}`} style={{ height: `${Math.max(4, (l.points / max) * 100)}%` }} />
            </div>
            <span className="scoreboard-digit text-xs text-slate-300">{l.points}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
