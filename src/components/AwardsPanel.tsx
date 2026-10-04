import type { Award } from '../lib/achievements'
import Panel from './ui/Panel'

// One card per award — the team's own color on the title so it reads at a glance who won what.
export default function AwardsPanel({ awards, title = 'AWARDS' }: { awards: Award[]; title?: string }) {
  if (awards.length === 0) return null
  return (
    <section>
      <h2 className="mb-3 font-display text-xl tracking-wide text-slate-300">{title}</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {awards.map((a) => (
          <Panel
            key={a.id}
            padding="sm"
            className={`flex items-center gap-3 ${a.shame ? 'border-scoreboard-500/40' : ''}`}
            style={{ borderLeftColor: a.color, borderLeftWidth: 4 }}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-3xl" style={{ background: `${a.color}22` }}>
              {a.icon}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-widest text-slate-500">{a.title}</div>
              <div className="truncate text-lg font-semibold" style={{ color: a.color }}>
                {a.teamName}
              </div>
              <div className="text-sm text-slate-400">{a.detail}</div>
            </div>
          </Panel>
        ))}
      </div>
    </section>
  )
}
