// The rematch options card: same teams, optional shuffle, and a capped head start for trailing teams.
export default function RematchModal({
  shuffle,
  onShuffle,
  handicap,
  onHandicap,
  onStart,
  onClose,
}: {
  shuffle: boolean
  onShuffle: (v: boolean) => void
  handicap: number
  onHandicap: (v: number) => void
  onStart: () => void
  onClose: () => void
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-4 rounded-2xl border border-arena-600 bg-arena-900 p-6 text-left shadow-2xl">
        <div className="font-display text-2xl tracking-wide text-white">REMATCH</div>
        <p className="text-xs text-slate-500">Starts a fresh copy with the same teams (phones stay joined). This game's result is kept for Stats and Seasons.</p>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={shuffle} onChange={(e) => onShuffle(e.target.checked)} className="h-4 w-4 accent-hardwood-500" />
          Shuffle the round order
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
          <span>
            Head start for trailing teams
            <span className="block text-xs text-slate-500">Up to this many points, never more than they lost by.</span>
          </span>
          <input
            type="number"
            min={0}
            max={20}
            value={handicap}
            onChange={(e) => onHandicap(Math.min(20, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
            className="w-16 rounded-lg border border-arena-600 bg-arena-800 px-2 py-1 text-center text-slate-100 outline-none focus:border-hardwood-500"
          />
        </label>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full border border-arena-500 py-2 text-sm text-slate-300 hover:border-hardwood-500">
            Cancel
          </button>
          <button onClick={onStart} className="flex-1 rounded-full bg-hardwood-500 py-2 text-sm font-semibold text-arena-950 hover:bg-hardwood-400">
            START REMATCH
          </button>
        </div>
      </div>
    </div>
  )
}
