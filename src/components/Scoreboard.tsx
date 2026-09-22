import type { Team } from '../types'

export default function Scoreboard({ teams, compact = false }: { teams: Team[]; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-stretch justify-center gap-3 ${compact ? '' : 'w-full max-w-3xl'}`}>
      {teams.map((team) => (
        <div
          key={team.id}
          className="min-w-[110px] flex-1 rounded-xl border border-arena-600 bg-arena-800/80 px-5 py-3 text-center shadow-lg shadow-black/30"
          style={{ borderBottomColor: team.color, borderBottomWidth: 3 }}
        >
          <div className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{team.name}</div>
          <div
            className={`scoreboard-digit font-display ${compact ? 'text-3xl' : 'text-6xl'} leading-none`}
            style={{ color: team.color }}
          >
            {team.score}
          </div>
        </div>
      ))}
    </div>
  )
}
