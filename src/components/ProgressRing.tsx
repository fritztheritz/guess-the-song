// A small ring that fills as teams lock in their guess — turns green when everyone's in, so the
// host can see at a glance when it's safe to reveal.
export default function ProgressRing({ value, max, size = 44, label = 'teams in' }: { value: number; max: number; size?: number; label?: string }) {
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = max > 0 ? Math.min(1, value / max) : 0
  const done = max > 0 && value >= max
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${value} of ${max} ${label}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-arena-700" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className={`transition-[stroke-dashoffset] duration-500 ${done ? 'stroke-scoreboard-green' : 'stroke-hardwood-500'}`}
        />
      </svg>
      <span className={`absolute text-xs font-bold ${done ? 'text-scoreboard-green' : 'text-slate-200'}`}>
        {value}/{max}
      </span>
    </div>
  )
}
