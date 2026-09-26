import { useEffect, useRef, useState } from 'react'
import type { Team } from '../types'

// Split out so each card can track its own previous score via a ref/effect — hooks can't
// run inside the .map() below, and this keeps the pop/glow entirely self-contained per team.
function TeamScoreCard({ team, compact }: { team: Team; compact: boolean }) {
  const [justScored, setJustScored] = useState(false)
  const prevScore = useRef(team.score)

  useEffect(() => {
    if (team.score === prevScore.current) return
    prevScore.current = team.score
    setJustScored(true)
    const timer = setTimeout(() => setJustScored(false), 700)
    return () => clearTimeout(timer)
  }, [team.score])

  return (
    <div
      className={`min-w-[110px] flex-1 rounded-xl border border-arena-600 bg-arena-800/80 px-5 py-3 text-center shadow-lg shadow-black/30 ${
        justScored ? 'animate-score-pop' : ''
      }`}
      style={{ borderBottomColor: team.color, borderBottomWidth: 3, '--pop-color': team.color } as React.CSSProperties}
    >
      <div className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{team.name}</div>
      <div
        className={`scoreboard-digit font-display ${compact ? 'text-3xl' : 'text-6xl'} leading-none`}
        style={{ color: team.color }}
      >
        {team.score}
      </div>
    </div>
  )
}

export default function Scoreboard({ teams, compact = false }: { teams: Team[]; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-stretch justify-center gap-3 ${compact ? '' : 'w-full max-w-3xl'}`}>
      {teams.map((team) => (
        <TeamScoreCard key={team.id} team={team} compact={compact} />
      ))}
    </div>
  )
}
