import { useMemo, useState } from 'react'
import type { TierList, TierListSong } from '../types/tierlist'

export default function ImportFromTierListModal({
  tierList,
  excludeTrackIds,
  onClose,
  onImport,
}: {
  tierList: TierList
  excludeTrackIds: Set<string>
  onClose: () => void
  onImport: (songs: TierListSong[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [randomCount, setRandomCount] = useState('')

  // Grouped by tier, ranked songs only — an unranked song has no tier/position to guess.
  const groups = useMemo(() => {
    return tierList.tiers
      .map((tier) => ({
        tier,
        songs: tierList.songs
          .filter((s) => s.tierId === tier.id && !excludeTrackIds.has(s.soundcloudTrackId))
          .sort((a, b) => a.order - b.order),
      }))
      .filter((g) => g.songs.length > 0)
  }, [tierList, excludeTrackIds])

  const allAvailable = useMemo(() => groups.flatMap((g) => g.songs), [groups])
  const allSelected = allAvailable.length > 0 && allAvailable.every((s) => selected.has(s.id))

  function toggle(song: TierListSong) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(song.id)) next.delete(song.id)
      else next.add(song.id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allAvailable.map((s) => s.id)))
  }

  function pickRandom() {
    const n = Math.max(0, Math.min(allAvailable.length, Math.floor(Number(randomCount) || 0)))
    if (n === 0) return
    const shuffled = [...allAvailable]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    setSelected(new Set(shuffled.slice(0, n).map((s) => s.id)))
  }

  function handleImport() {
    onImport(allAvailable.filter((s) => selected.has(s.id)))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-arena-600 bg-arena-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-arena-700 px-6 py-4">
          <div>
            <h2 className="font-display text-2xl tracking-wide text-hardwood-400">PICK SONGS TO QUIZ</h2>
            <p className="text-sm text-slate-400">From "{tierList.name}" — only ranked songs can be guessed.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-arena-700 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {allAvailable.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">
              Every ranked song from this tier list is already in this game.
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span>Randomly pick</span>
                  <input
                    type="number"
                    min={1}
                    max={allAvailable.length}
                    value={randomCount}
                    onChange={(e) => setRandomCount(e.target.value)}
                    placeholder="e.g. 10"
                    className="w-20 rounded-md border border-arena-600 bg-arena-800 px-2 py-1 text-center text-slate-100 outline-none focus:border-hardwood-500"
                  />
                  <button
                    onClick={pickRandom}
                    disabled={!randomCount || Number(randomCount) < 1}
                    className="rounded-md border border-arena-500 px-3 py-1 text-xs text-slate-300 hover:border-hardwood-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Pick
                  </button>
                </div>
                <button onClick={toggleAll} className="text-sm text-hardwood-400 underline hover:text-hardwood-300">
                  {allSelected ? `Deselect all ${allAvailable.length}` : `Select all ${allAvailable.length}`}
                </button>
              </div>
              <div className="space-y-4">
                {groups.map(({ tier, songs }) => (
                  <div key={tier.id}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="rounded-full px-2.5 py-0.5 font-display text-xs text-arena-950" style={{ background: tier.color }}>
                        {tier.name}
                      </span>
                      <span className="text-xs text-slate-500">{songs.length} song{songs.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="space-y-1">
                      {songs.map((song) => (
                        <label
                          key={song.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                            selected.has(song.id) ? 'border-hardwood-500 bg-hardwood-500/10' : 'border-arena-700 bg-arena-800/50 hover:border-arena-600'
                          }`}
                        >
                          <input type="checkbox" checked={selected.has(song.id)} onChange={() => toggle(song)} className="accent-hardwood-500" />
                          <span className="w-8 shrink-0 text-center text-xs text-slate-500">#{song.order + 1}</span>
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-arena-700">
                            {song.artworkUrl && <img src={song.artworkUrl} alt="" className="h-full w-full object-cover" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-slate-100">{song.title}</div>
                            <div className="truncate text-xs text-slate-500">{song.artist}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-arena-700 px-6 py-3">
          <button
            disabled={selected.size === 0}
            onClick={handleImport}
            className="rounded-full bg-hardwood-500 px-6 py-2.5 font-semibold text-arena-950 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-hardwood-400"
          >
            ADD {selected.size || ''} SONG{selected.size === 1 ? '' : 'S'} TO GAME
          </button>
        </div>
      </div>
    </div>
  )
}
