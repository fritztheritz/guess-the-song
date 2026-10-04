import { rulesFor, type RuleMode } from '../lib/mode-rules'

const yes = (on: boolean) => (on ? '✓' : '—')

// "How this mode scores" — the same facts the game itself enforces (lib/mode-rules.ts), so what
// the host reads when picking a mode is never different from what happens at the table.
export default function ModeRulesCard({ mode }: { mode: RuleMode }) {
  const r = rulesFor(mode)
  const items: Array<[string, boolean]> = [
    ['Power-ups', r.powerUps],
    ['Underdog catch-up', r.catchUp],
    ['Ref\'s call (eject)', r.eject],
    ['Sudden death', r.suddenDeath],
    ['Wagers', r.wager],
  ]
  return (
    <div className="rounded-xl border border-arena-600 bg-arena-800/50 p-3 text-sm">
      <div className="font-semibold text-slate-100">
        {r.icon} How {r.label} scores
      </div>
      <p className="mt-1 text-xs text-slate-400">{r.scoring}</p>
      <p className="mt-1 text-xs text-slate-500">
        {r.scorers === 'many' ? 'Several teams can score the same possession.' : 'One team scores each possession.'} Streaks:{' '}
        {r.streaks === 'bonus' ? 'consecutive scores earn bonus points.' : 'a 🔥 badge only — no extra points.'}
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {items.map(([label, on]) => (
          <li key={label} className={on ? 'text-slate-300' : 'text-slate-600'}>
            <span className={on ? 'text-scoreboard-green' : ''}>{yes(on)}</span> {label}
          </li>
        ))}
      </ul>
    </div>
  )
}
