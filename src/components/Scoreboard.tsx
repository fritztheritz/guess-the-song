import { useEffect, useRef, useState } from 'react'
import type { Team } from '../types'
import MoveTag from './MoveTag'

const COUNT_MS = 600

/** Eases the shown number toward `target` instead of snapping — skipped for users who prefer
 *  reduced motion. */
function prefersReducedMotion(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function useCountUp(target: number): number {
  const [shown, setShown] = useState(target)
  const fromRef = useRef(target)
  useEffect(() => {
    const from = fromRef.current
    if (from === target) return
    if (prefersReducedMotion()) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS)
      const value = Math.round(from + (target - from) * (1 - (1 - t) * (1 - t)))
      fromRef.current = value
      setShown(value)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  // Reduced motion: no tween, just the real number.
  return prefersReducedMotion() ? target : shown
}

// Split out so each card can track its own previous score via a ref/effect — hooks can't
// run inside the .map() below, and this keeps the pop/glow entirely self-contained per team.
function TeamScoreCard({ team, compact, move }: { team: Team; compact: boolean; move: number }) {
  const [justScored, setJustScored] = useState(false)
  const [delta, setDelta] = useState<{ key: number; amount: number } | null>(null)
  const prevScore = useRef(team.score)
  const shown = useCountUp(team.score)

  useEffect(() => {
    if (team.score === prevScore.current) return
    setDelta({ key: Date.now(), amount: team.score - prevScore.current })
    prevScore.current = team.score
    setJustScored(true)
    const timer = setTimeout(() => setJustScored(false), 700)
    const deltaTimer = setTimeout(() => setDelta(null), 1400)
    return () => {
      clearTimeout(timer)
      clearTimeout(deltaTimer)
    }
  }, [team.score])

  const onFire = (team.streak ?? 0) >= 2

  return (
    <div
      className={`relative min-w-[110px] flex-1 rounded-xl border border-arena-600 bg-arena-800/80 px-5 py-3 text-center shadow-lg shadow-black/30 ${
        justScored ? 'animate-score-pop' : ''
      }`}
      style={{ borderBottomColor: team.color, borderBottomWidth: 3, '--pop-color': team.color } as React.CSSProperties}
    >
      {onFire && (
        <span className="absolute -right-2 -top-2 rounded-full bg-scoreboard-amber px-1.5 py-0.5 text-[10px] font-bold leading-none text-arena-950 shadow" title={`${team.streak} scored in a row`}>
          🔥{team.streak}
        </span>
      )}
      {delta && (
        <span
          key={delta.key}
          aria-hidden
          className={`animate-score-delta pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 font-display text-xl ${
            delta.amount > 0 ? 'text-scoreboard-green' : 'text-scoreboard-500'
          }`}
        >
          {delta.amount > 0 ? '+' : ''}
          {delta.amount}
        </span>
      )}
      <div className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {team.avatar ? `${team.avatar} ` : ''}
        {team.name}
        <MoveTag move={move} />
      </div>
      <div
        className={`scoreboard-digit font-display ${compact ? 'text-3xl' : 'text-6xl'} leading-none`}
        style={{ color: team.color }}
        aria-label={`${team.score} points`}
      >
        {shown}
      </div>
    </div>
  )
}

/** `moves`: places each team has climbed (+) or dropped (−) since the last checkpoint —
 *  shown as ▲/▼ tags, for the halftime and final scoreboards. */
export default function Scoreboard({ teams, compact = false, moves }: { teams: Team[]; compact?: boolean; moves?: Record<string, number> }) {
  return (
    <div className={`flex flex-wrap items-stretch justify-center gap-3 ${compact ? '' : 'w-full max-w-3xl'}`}>
      {teams.map((team) => (
        <TeamScoreCard key={team.id} team={team} compact={compact} move={moves?.[team.id] ?? 0} />
      ))}
    </div>
  )
}
