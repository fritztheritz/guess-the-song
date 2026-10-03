import type { Team } from '../types'

interface Props {
  title: string
  teams: Team[]
  credited: Set<string>
  onToggle: (team: Team) => void
  /** Whether a team is blocked this possession (ejected / sitting out) — they can't be newly credited. */
  isBlocked?: (teamId: string) => boolean
  /** Prefix shown on a blocked team's button (🟥 / 🚫). */
  blockedMark?: (teamId: string) => string
}

// One row of "who gets this credit" toggles for Tier Guess / Year Guess — the host taps teams
// on and back off, since several can earn the same credit on one possession.
export default function CreditGrid({ title, teams, credited, onToggle, isBlocked, blockedMark }: Props) {
  return (
    <div>
      <div className="mb-1.5 text-sm uppercase tracking-widest text-slate-400">{title}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {teams.map((team) => (
          <button
            key={team.id}
            onClick={() => onToggle(team)}
            disabled={!!isBlocked?.(team.id) && !credited.has(team.id)}
            className={`truncate rounded-xl border px-2 py-2.5 font-semibold ${
              credited.has(team.id) ? 'border-scoreboard-green bg-scoreboard-green/15' : 'border-arena-600 bg-arena-800 hover:border-hardwood-500'
            }`}
            style={{ color: team.color }}
          >
            {credited.has(team.id) ? '✓ ' : ''}
            {blockedMark?.(team.id)}
            {team.name}
          </button>
        ))}
      </div>
    </div>
  )
}
