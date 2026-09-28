import { Link } from 'react-router-dom'
import type { TierList } from '../types/tierlist'
import ModalShell from './ui/ModalShell'

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
    <ModalShell title="PICK A TIER LIST" subtitle="Which ranking should this game quiz players on?" onClose={onClose}>
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
    </ModalShell>
  )
}
