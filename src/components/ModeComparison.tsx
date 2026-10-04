import { MODE_RULES, balanceSpread, type RuleMode } from '../lib/mode-rules'

const tick = (on: boolean) => (on ? '✓' : '—')

// Every mode side by side: what each supports and the most a team can bank in one possession — the
// table behind the balance check in lib/mode-rules.test.ts.
export default function ModeComparison() {
  const modes = Object.keys(MODE_RULES) as RuleMode[]
  return (
    <div className="overflow-x-auto rounded-xl border border-arena-600">
      <table className="w-full min-w-[34rem] text-left text-xs">
        <thead className="bg-arena-800 text-slate-400">
          <tr>
            <th className="px-3 py-2 font-medium">Mode</th>
            <th className="px-2 py-2 font-medium">Max / possession</th>
            <th className="px-2 py-2 font-medium">Scorers</th>
            <th className="px-2 py-2 font-medium">Streaks</th>
            <th className="px-2 py-2 font-medium">Power-ups</th>
            <th className="px-2 py-2 font-medium">Catch-up</th>
            <th className="px-2 py-2 font-medium">Eject</th>
            <th className="px-2 py-2 font-medium">Sudden death</th>
          </tr>
        </thead>
        <tbody className="text-slate-300">
          {modes.map((m) => {
            const r = MODE_RULES[m]
            return (
              <tr key={m} className="border-t border-arena-700">
                <td className="px-3 py-2">
                  {r.icon} {r.label}
                </td>
                <td className="px-2 py-2 font-semibold text-white">{r.maxPerPossession}</td>
                <td className="px-2 py-2">{r.scorers === 'many' ? 'Several' : 'One'}</td>
                <td className="px-2 py-2">{r.streaks === 'bonus' ? 'Bonus pts' : 'Badge'}</td>
                <td className="px-2 py-2">{tick(r.powerUps)}</td>
                <td className="px-2 py-2">{tick(r.catchUp)}</td>
                <td className="px-2 py-2">{tick(r.eject)}</td>
                <td className="px-2 py-2">{tick(r.suddenDeath)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="border-t border-arena-700 px-3 py-2 text-[11px] text-slate-500">
        Best mode is {balanceSpread().toFixed(1)}× the lowest per possession (kept ≤ 2× by a test).
      </p>
    </div>
  )
}
