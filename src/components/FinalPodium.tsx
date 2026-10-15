import type { Team } from '../types'
import MoveTag from './MoveTag'
import SegDigits from './SegDigits'
import { Icon } from './Icon'
import { withIcons } from '../lib/with-icons'

const PLACE = [
  { height: 'h-36', medal: '🥇' },
  { height: 'h-28', medal: '🥈' },
  { height: 'h-20', medal: '🥉' },
]

// The end-of-game poster: the top three on a podium (winner in the middle and tallest, with a
// crown), anyone beyond that listed underneath. A tie for first shares the top step's medal.
export default function FinalPodium({ teams, moves }: { teams: Team[]; moves?: Record<string, number> }) {
  const sorted = [...teams].sort((a, b) => b.score - a.score)
  const top = sorted.slice(0, 3)
  const rest = sorted.slice(3)
  // Classic podium order: 2nd, 1st, 3rd.
  const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0]
  const tiedForFirst = sorted.length > 1 && sorted[0].score === sorted[1].score
  return (
    <div className="w-full max-w-xl space-y-4">
      <div className="flex items-end justify-center gap-3">
        {order.map((rank) => {
          const team = top[rank]
          const style = PLACE[rank]
          const isWinner = rank === 0 || (tiedForFirst && team.score === sorted[0].score)
          return (
            <div key={team.id} className="flex w-1/3 max-w-[10rem] flex-col items-center gap-1.5 animate-pop-in" style={{ animationDelay: `${(2 - rank) * 150}ms` }}>
              {isWinner && <span className="sticker text-sm">Champs</span>}
              <div className="max-w-full truncate text-center font-display text-xl" style={{ color: team.color }}>
                {team.avatar ? `${team.avatar} ` : ''}
                {team.name}
                <MoveTag move={moves?.[team.id] ?? 0} />
              </div>
              {(team.streak ?? 0) >= 2 && <div className="text-xs"><Icon name="flame" />{team.streak}</div>}
              <div
                className={`hardwood relative flex w-full flex-col items-center justify-start overflow-hidden rounded-t-xl border-2 border-b-0 border-black/40 pt-3 ${style.height}`}
                style={{ borderTopColor: team.color, borderTopWidth: 5 }}
              >
                <div className="text-2xl" aria-hidden>
                  {withIcons(style.medal)}
                </div>
                <span aria-hidden className="jersey-num absolute -bottom-2 left-1 select-none text-6xl text-black/45">
                  {rank + 1}
                </span>
                <div className="relative rounded-sm bg-black/60 px-1.5 py-1 text-scoreboard-amber">
                  <SegDigits value={team.score} cells={2} className="text-2xl" label={`${team.score} points`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="h-1 rounded bg-gradient-to-r from-transparent via-hardwood-500/60 to-transparent" aria-hidden />
      {rest.length > 0 && (
        <div className="space-y-2">
          {rest.map((team, i) => (
            <div key={team.id} className="flex items-center justify-between rounded-xl border border-arena-600 bg-arena-800/70 px-5 py-2">
              <span className="font-display text-lg" style={{ color: team.color }}>
                <span className="mr-2 text-sm text-slate-500">{i + 4}.</span>
                {team.avatar ? `${team.avatar} ` : ''}
                {team.name}
                <MoveTag move={moves?.[team.id] ?? 0} />
              </span>
              <span className="scoreboard-digit font-display text-2xl">{team.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
