import type { Drafter } from '../types/draft'
import ProgressRing from './ProgressRing'

interface Props {
  round: number
  rounds: number
  pickNumber: number
  totalPicks: number
  drafter: Drafter
  onDeck: Drafter[]
  onUndo?: () => void
}

// "Whose pick is it" — pinned to the top of the screen while the pool scrolls underneath, so the
// current drafter, undo and what's coming next never scroll out of reach on a big pool.
export default function DraftTurnBanner({ round, rounds, pickNumber, totalPicks, drafter, onDeck, onUndo }: Props) {
  return (
    <div className="sticky top-0 z-20 -mx-2 rounded-xl border border-hardwood-500 bg-arena-950/95 px-4 py-2.5 shadow-lg shadow-black/40 backdrop-blur">
      <div className="flex items-center gap-3">
        <ProgressRing value={pickNumber} max={totalPicks} size={46} />
        <div className="min-w-0 flex-1 text-center">
          <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
            Round {round} of {rounds} · Pick {pickNumber + 1} of {totalPicks}
          </div>
          <div className="truncate font-display text-2xl tracking-wide" style={{ color: drafter.color }}>
            {drafter.avatar ? `${drafter.avatar} ` : ''}
            {drafter.name.toUpperCase()}'S PICK
          </div>
          {onDeck.length > 0 && (
            <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1.5 text-xs text-slate-500">
              <span className="uppercase tracking-widest">On deck</span>
              {onDeck.map((d, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-arena-600">→</span>}
                  <span style={{ color: d.color }}>
                    {d.avatar ? `${d.avatar} ` : ''}
                    {d.name}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
        {onUndo ? (
          <button
            onClick={onUndo}
            className="shrink-0 rounded-full border border-arena-500 px-3 py-1 text-xs text-slate-300 hover:border-hardwood-400 hover:text-hardwood-300"
          >
            ↩ Undo
          </button>
        ) : (
          <div className="w-12 shrink-0" aria-hidden />
        )}
      </div>
    </div>
  )
}
