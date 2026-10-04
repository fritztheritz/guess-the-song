import { useState } from 'react'
import type { DraftPoolSong, Drafter } from '../types/draft'
import DrafterRoster from './DrafterRoster'

const KEY = 'gts.draft.rostersOpen.v1'

function readOpen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

// Every drafter's picks so far, kept out of the way: a one-line chip per drafter (name, picks
// made, latest pick, current drafter ringed) that expands to the full roster cards on demand.
export default function RosterStrip({
  drafters,
  rosterFor,
  picksPerDrafter,
  currentDrafterId,
}: {
  drafters: Drafter[]
  rosterFor: (drafterId: string) => DraftPoolSong[]
  picksPerDrafter: number
  currentDrafterId?: string
}) {
  const [open, setOpen] = useState(readOpen)
  const toggle = () => {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch {
      // Best-effort only.
    }
  }
  return (
    <section>
      <button
        onClick={toggle}
        aria-expanded={open}
        className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500 hover:text-slate-300"
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        Rosters
      </button>
      {open ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {drafters.map((drafter) => (
            <DrafterRoster key={drafter.id} drafter={drafter} songs={rosterFor(drafter.id)} highlight={drafter.id === currentDrafterId} />
          ))}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {drafters.map((drafter) => {
            const songs = rosterFor(drafter.id)
            const last = songs[songs.length - 1]
            const active = drafter.id === currentDrafterId
            return (
              <div
                key={drafter.id}
                className={`min-w-[10rem] max-w-[14rem] shrink-0 rounded-xl border px-3 py-2 ${
                  active ? 'border-hardwood-500 bg-hardwood-500/10' : 'border-arena-600 bg-arena-800/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-sm font-semibold" style={{ color: drafter.color }}>
                  <span className="truncate">
                    {drafter.avatar ? `${drafter.avatar} ` : ''}
                    {drafter.name}
                  </span>
                  <span className="shrink-0 text-xs font-normal text-slate-500">
                    {songs.length}/{picksPerDrafter}
                  </span>
                </div>
                <div className="truncate text-xs text-slate-500">{last ? `Last: ${last.title}` : 'No picks yet'}</div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
