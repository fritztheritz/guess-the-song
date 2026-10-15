import { useMemo } from 'react'
import type { Game } from '../types'
import { buildBoxScore } from '../lib/box-score'
import SegDigits from './SegDigits'

// The end-of-game box score: a line score by possession and a counting-stat strip, laid out like the
// one in the paper after a game. Scrolls sideways on a phone rather than squeezing the numbers.
export default function BoxScore({ game, className = '' }: { game: Game; className?: string }) {
  const box = useMemo(() => buildBoxScore(game), [game])
  if (!box) return null
  const th = 'px-2 py-1.5 text-center font-display text-sm font-normal tracking-widest text-slate-500'
  return (
    <section aria-label="Box score" className={`w-full max-w-3xl overflow-hidden rounded-xl border-2 border-arena-600 bg-black/35 text-left shadow-xl ${className}`}>
      <div className="flex items-center justify-between border-b-2 border-arena-600 bg-arena-800 px-4 py-2">
        <h2 className="font-display text-xl tracking-widest text-slate-200">BOX SCORE</h2>
        <span className="text-xs uppercase tracking-widest text-slate-500">
          {box.possessions.length} possession{box.possessions.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b border-arena-700">
              <th scope="col" className={`${th} sticky left-0 bg-arena-900 text-left`}>
                TEAM
              </th>
              {box.possessions.map((p, i) => (
                <th key={p.index} scope="col" className={`${th} font-mono text-xs`} title={p.title}>
                  {i + 1}
                </th>
              ))}
              <th scope="col" className={`${th} border-l-2 border-arena-600 text-scoreboard-amber`}>
                PTS
              </th>
              <th scope="col" className={th} title="Possessions with points">
                SCR
              </th>
              <th scope="col" className={th} title="Best single possession">
                BEST
              </th>
              <th scope="col" className={th} title="Longest run of scoring possessions">
                STK
              </th>
              <th scope="col" className={th} title="Points per possession">
                PPP
              </th>
            </tr>
          </thead>
          <tbody>
            {box.rows.map((r) => {
              const leader = box.leaderIds.includes(r.teamId)
              return (
                <tr key={r.teamId} className="border-b border-arena-700 last:border-b-0">
                  <th scope="row" className="sticky left-0 whitespace-nowrap bg-arena-900 px-3 py-2 text-left font-display text-base font-normal tracking-wide" style={{ color: r.color, boxShadow: `inset 4px 0 0 ${r.color}` }}>
                    <span className="pl-1">
                      {r.avatar ? `${r.avatar} ` : ''}
                      {r.name}
                    </span>
                    {leader && <span className="sticker ml-2 align-middle text-xs">W</span>}
                  </th>
                  {r.cells.map((c, i) => (
                    <td key={i} className={`px-2 py-2 text-center font-mono tabular-nums ${c > 0 ? 'text-slate-100' : c < 0 ? 'text-scoreboard-500' : 'text-slate-600'}`}>
                      {c === 0 ? '·' : c > 0 ? c : c}
                    </td>
                  ))}
                  <td className="border-l-2 border-arena-600 px-2 py-1.5 text-center text-scoreboard-amber">
                    <SegDigits value={r.total} cells={2} className="text-xl" />
                  </td>
                  <td className="px-2 py-2 text-center font-mono tabular-nums text-slate-300">{r.scored}</td>
                  <td className="px-2 py-2 text-center font-mono tabular-nums text-slate-300">{r.best || '·'}</td>
                  <td className="px-2 py-2 text-center font-mono tabular-nums text-slate-300">{r.streak || '·'}</td>
                  <td className="px-2 py-2 text-center font-mono tabular-nums text-slate-300">{r.ppp.toFixed(1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
