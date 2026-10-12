import type { Series } from '../lib/history'

// Cumulative score per team across a game — one line each in the team's own colour, with the
// legend underneath (direct end labels would collide when scores tie).
export default function ScoreLines({ series }: { series: Series[] }) {
  const steps = Math.max(1, (series[0]?.points.length ?? 1) - 1)
  const max = Math.max(1, ...series.flatMap((s) => s.points))
  const W = 640
  const H = 200
  const pad = { l: 28, r: 12, t: 12, b: 22 }
  const x = (i: number) => pad.l + (i / steps) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const ticks = [0, Math.round(max / 2), max]
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Score by possession for each team">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-arena-700" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-500" fontSize={10}>
              {t}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 6} className="fill-slate-500" fontSize={10}>
          Start
        </text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" className="fill-slate-500" fontSize={10}>
          Possession {steps}
        </text>
        {series.map((s) => (
          <polyline
            key={s.teamId}
            fill="none"
            stroke={s.color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={s.points.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {series.map((s) => (
          <span key={s.teamId} className="flex items-center gap-1.5" style={{ color: s.color }}>
            <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.name} · {s.points[s.points.length - 1]}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
