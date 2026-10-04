import type { Game } from '../types'

// The last few finished games as grouped bars (one bar per team, in that game's own team
// colours), oldest to newest — a quick read on whether scores are trending up and who's been
// beating whom.
export default function ScoreTrend({ games }: { games: Game[] }) {
  if (games.length < 2) return null
  const max = Math.max(1, ...games.flatMap((g) => g.teams.map((t) => t.score)))
  return (
    <section>
      <h2 className="mb-1 font-display text-xl tracking-wide text-slate-300">RECENT SCORES</h2>
      <p className="mb-3 text-xs text-slate-500">The last {games.length} finished games, oldest to newest.</p>
      <div className="flex items-end gap-3 overflow-x-auto rounded-xl border border-arena-700 bg-arena-900/50 px-4 pb-3 pt-6">
        {games.map((g) => (
          <div key={g.id} className="flex min-w-[56px] flex-1 flex-col items-center gap-2">
            <div className="flex h-32 items-end gap-1">
              {g.teams.map((t) => (
                <div key={t.id} className="flex h-full flex-col items-center justify-end" title={`${t.name}: ${t.score}`}>
                  <span className="mb-0.5 text-[10px] text-slate-400">{t.score}</span>
                  <div className="w-3 rounded-t" style={{ height: `${Math.max(4, (t.score / max) * 100)}%`, background: t.color }} />
                </div>
              ))}
            </div>
            <div className="w-full truncate text-center text-[10px] text-slate-500" title={g.name}>
              {g.name}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
