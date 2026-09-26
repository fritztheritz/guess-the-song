import { useMemo, useState } from 'react'
import { teamColorForIndex } from '../types'
import { listTeamPresets, type TeamPreset } from '../lib/team-presets'
import type { Drafter } from '../types/draft'

const MIN_DRAFTERS = 2
const MAX_DRAFTERS = 8

interface DrafterDraft {
  name: string
  color: string
  avatar?: string
}

function drafterDraft(index: number): DrafterDraft {
  return { name: `Drafter ${index + 1}`, color: teamColorForIndex(index) }
}

export default function NewDraftSessionModal({
  defaultName,
  availableSongCount,
  onClose,
  onCreate,
}: {
  defaultName: string
  availableSongCount: number
  onClose: () => void
  onCreate: (params: { name: string; drafters: Drafter[]; picksPerDrafter: number }) => void
}) {
  const [name, setName] = useState(defaultName)
  const [drafters, setDrafters] = useState<DrafterDraft[]>([drafterDraft(0), drafterDraft(1)])
  const [picksPerDrafter, setPicksPerDrafter] = useState(5)
  const [presetPickerIndex, setPresetPickerIndex] = useState<number | null>(null)
  const presets = useMemo(() => listTeamPresets(), [])

  const needed = drafters.length * picksPerDrafter
  const notEnough = needed > availableSongCount

  function addDrafter() {
    if (drafters.length >= MAX_DRAFTERS) return
    setDrafters((prev) => [...prev, drafterDraft(prev.length)])
  }

  function removeDrafter(i: number) {
    if (drafters.length <= MIN_DRAFTERS) return
    setDrafters((prev) => prev.filter((_, idx) => idx !== i))
  }

  function renameDrafter(i: number, value: string) {
    setDrafters((prev) => prev.map((d, idx) => (idx === i ? { ...d, name: value } : d)))
  }

  function applyPreset(i: number, preset: TeamPreset) {
    setDrafters((prev) => prev.map((d, idx) => (idx === i ? { ...d, name: preset.name, color: preset.color, avatar: preset.avatar } : d)))
    setPresetPickerIndex(null)
  }

  function handleCreate() {
    if (notEnough) return
    const finalDrafters: Drafter[] = drafters.map((d, i) => ({
      id: crypto.randomUUID(),
      name: d.name.trim() || `Drafter ${i + 1}`,
      color: d.color,
      avatar: d.avatar,
    }))
    onCreate({ name: name.trim() || defaultName, drafters: finalDrafters, picksPerDrafter })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-arena-600 bg-arena-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-arena-700 px-6 py-4">
          <div>
            <h2 className="font-display text-2xl tracking-wide text-hardwood-400">NEW DRAFT SESSION</h2>
            <p className="text-sm text-slate-400">Who's drafting, and how many picks each?</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-arena-700 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Session name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-slate-100 outline-none focus:border-hardwood-500"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm text-slate-400">Drafters</label>
              <span className="text-xs text-slate-500">
                {drafters.length}/{MAX_DRAFTERS}
              </span>
            </div>
            <div className="space-y-2">
              {drafters.map((drafter, i) => (
                <div key={i} className="relative flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs"
                    style={{ background: `${drafter.color}33`, color: drafter.color }}
                  >
                    {drafter.avatar ?? ''}
                  </span>
                  <input
                    value={drafter.name}
                    onChange={(e) => renameDrafter(i, e.target.value)}
                    className="w-full rounded-lg border border-arena-600 bg-arena-800 px-3 py-1.5 text-slate-100 outline-none focus:border-hardwood-500"
                  />
                  {presets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPresetPickerIndex(presetPickerIndex === i ? null : i)}
                      aria-label="Fill from a saved team"
                      className="shrink-0 rounded-lg border border-arena-600 px-2 py-1.5 text-sm text-slate-400 hover:border-hardwood-500 hover:text-hardwood-400"
                    >
                      ★
                    </button>
                  )}
                  {drafters.length > MIN_DRAFTERS && (
                    <button
                      type="button"
                      onClick={() => removeDrafter(i)}
                      aria-label={`Remove ${drafter.name}`}
                      className="shrink-0 rounded-lg px-2 py-1 text-slate-500 hover:text-scoreboard-500"
                    >
                      ✕
                    </button>
                  )}
                  {presetPickerIndex === i && (
                    <>
                      <div className="fixed inset-0 z-0" onClick={() => setPresetPickerIndex(null)} />
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-11 z-10 max-h-56 w-56 overflow-y-auto rounded-lg border border-arena-600 bg-arena-900 p-1.5 shadow-xl"
                      >
                        {presets.map((preset) => (
                          <button
                            key={preset.name}
                            type="button"
                            onClick={() => applyPreset(i, preset)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-arena-700"
                          >
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: preset.color }} />
                            {preset.avatar ? `${preset.avatar} ` : ''}
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            {drafters.length < MAX_DRAFTERS && (
              <button
                type="button"
                onClick={addDrafter}
                className="mt-2 w-full rounded-lg border border-dashed border-arena-500 py-1.5 text-sm text-slate-400 hover:border-hardwood-500 hover:text-hardwood-400"
              >
                + Add Drafter
              </button>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">Picks per drafter</label>
            <input
              type="number"
              min={1}
              max={20}
              value={picksPerDrafter}
              onChange={(e) => setPicksPerDrafter(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className="w-24 rounded-lg border border-arena-600 bg-arena-800 px-3 py-1.5 text-center text-slate-100 outline-none focus:border-hardwood-500"
            />
          </div>

          <div className={`rounded-lg px-3 py-2 text-sm ${notEnough ? 'bg-scoreboard-500/10 text-scoreboard-500' : 'text-slate-500'}`}>
            {needed} song{needed === 1 ? '' : 's'} needed · {availableSongCount} available
            {notEnough ? ' — add more songs to the pool first' : ''}
          </div>
        </div>

        <div className="border-t border-arena-700 px-6 py-3">
          <button
            disabled={notEnough}
            onClick={handleCreate}
            className="w-full rounded-full bg-hardwood-500 py-2.5 font-semibold text-arena-950 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-hardwood-400"
          >
            START DRAFT →
          </button>
        </div>
      </div>
    </div>
  )
}
