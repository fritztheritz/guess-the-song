import { Link } from 'react-router-dom'
import type { TierList } from '../types/tierlist'

export default function TierListPickerModal({
  tierLists,
  onClose,
  onPick,
}: {
  tierLists: TierList[]
  onClose: () => void
  onPick: (list: TierList) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-arena-600 bg-arena-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-arena-700 px-6 py-4">
          <div>
            <h2 className="font-display text-2xl tracking-wide text-hardwood-400">PICK A TIER LIST</h2>
            <p className="text-sm text-slate-400">Which ranking should this game quiz players on?</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-arena-700 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tierLists.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-400">
              You don't have any tier lists yet.{' '}
              <Link to="/" className="text-hardwood-400 underline hover:text-hardwood-300">
                Make one from Home
              </Link>{' '}
              first, then come back here.
            </div>
          ) : (
            <div className="space-y-2">
              {tierLists.map((list) => {
                const ranked = list.songs.filter((s) => s.tierId !== null).length
                return (
                  <button
                    key={list.id}
                    onClick={() => onPick(list)}
                    disabled={ranked === 0}
                    className="flex w-full items-center justify-between rounded-xl border border-arena-600 bg-arena-800/60 px-4 py-3 text-left hover:border-hardwood-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <div>
                      <div className="font-semibold text-slate-100">{list.name}</div>
                      <div className="text-xs text-slate-500">
                        {ranked === 0 ? 'Nothing ranked yet' : `${ranked} ranked song${ranked === 1 ? '' : 's'} · ${list.tiers.length} tiers`}
                      </div>
                    </div>
                    <span className="text-slate-500">→</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
