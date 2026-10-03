import type { PlayerRow } from '../lib/achievements'
import Panel from './ui/Panel'

// Phone players ranked by points — only present once games have been played with Phone
// Buzz-In, since that's the only place a score can be pinned on an individual.
export default function PlayerLeaderboard({ players }: { players: PlayerRow[] }) {
  if (players.length === 0) return null
  return (
    <section>
      <h2 className="mb-1 font-display text-xl tracking-wide text-slate-300">PLAYER LEADERBOARD</h2>
      <p className="mb-3 text-xs text-slate-500">Phone players, matched by name across every completed game.</p>
      <div className="space-y-2">
        {players.slice(0, 10).map((p, i) => (
          <Panel key={p.name} padding="sm" className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-medium" style={{ color: p.color }}>
              {i === 0 ? '⭐ ' : ''}
              {p.name}
              <span className="ml-2 text-xs text-slate-500">
                {p.teamName} · {p.games} game{p.games === 1 ? '' : 's'}
              </span>
            </span>
            <span className="shrink-0 text-right text-xs text-slate-400">
              {p.correct} right · {p.buzzes} buzz{p.buzzes === 1 ? '' : 'es'}
              {p.fastestMs !== undefined ? ` · ${(p.fastestMs / 1000).toFixed(2)}s best` : ''}
              <span className="ml-3 scoreboard-digit font-display text-lg text-slate-100">{p.points}</span>
            </span>
          </Panel>
        ))}
      </div>
    </section>
  )
}
