import { useMemo, useState } from 'react'
import { teamColorForIndex, TEAM_AVATARS, TEAM_COLORS } from '../types'
import { randomTeams } from '../lib/team-names'
import { listTeamPresets, type TeamPreset } from '../lib/team-presets'
import type { Drafter } from '../types/draft'
import DraftOrderWheel from './DraftOrderWheel'
import ModalShell from './ui/ModalShell'
import TextInput from './ui/TextInput'
import Button from './ui/Button'

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
  const [stylePickerIndex, setStylePickerIndex] = useState<number | null>(null)
  const [wheelOpen, setWheelOpen] = useState(false)
  const presets = useMemo(() => listTeamPresets(), [])

  const needed = drafters.length * picksPerDrafter
  const notEnough = needed > availableSongCount

  function addDrafter() {
    if (drafters.length >= MAX_DRAFTERS) return
    setDrafters((prev) => [...prev, drafterDraft(prev.length)])
  }

  // Jump straight to N drafters, keeping the ones already filled in.
  function setDrafterCount(count: number) {
    setDrafters((prev) => (count <= prev.length ? prev.slice(0, count) : [...prev, ...Array.from({ length: count - prev.length }, (_, k) => drafterDraft(prev.length + k))]))
    setStylePickerIndex(null)
  }

  // Fun names and mascots for everyone (the 🎡 wheel is for the pick ORDER, this is for identity).
  function randomizeNames() {
    setDrafters(randomTeams(drafters.length))
    setStylePickerIndex(null)
  }

  function styleDrafter(i: number, patch: Partial<DrafterDraft>) {
    setDrafters((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
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

  function moveDrafter(i: number, direction: -1 | 1) {
    setDrafters((prev) => {
      const next = [...prev]
      const target = i + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[i], next[target]] = [next[target], next[i]]
      return next
    })
  }

  function applyWheelOrder(orderedIndices: number[]) {
    setDrafters((prev) => orderedIndices.map((i) => prev[i]))
    setWheelOpen(false)
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
    <>
      <ModalShell title="NEW DRAFT SESSION" subtitle="Who's drafting, and how many picks each?" onClose={onClose}>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Session name</label>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm text-slate-400">Drafters</label>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDrafterCount(n)}
                    aria-pressed={drafters.length === n}
                    aria-label={`${n} drafters`}
                    className={`h-7 w-7 rounded-full text-xs font-semibold ${
                      drafters.length === n ? 'bg-hardwood-500 text-arena-950' : 'border border-arena-600 text-slate-400 hover:border-hardwood-500'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={randomizeNames}
                  className="rounded-full border border-arena-600 px-2.5 py-1 text-xs text-slate-300 hover:border-hardwood-500 hover:text-hardwood-400"
                  title="Give everyone a random name and mascot"
                >
                  🎲 Names
                </button>
                <button
                  type="button"
                  onClick={() => setWheelOpen(true)}
                  className="rounded-full border border-arena-600 px-2.5 py-1 text-xs text-slate-300 hover:border-hardwood-500 hover:text-hardwood-400"
                  title="Spin the wheel for pick order"
                >
                  🎡 Order
                </button>
              </div>
            </div>
            <p className="mb-2 text-xs text-slate-500">Top of the list picks first. Reorder with the arrows, or spin the wheel for the order.</p>
            <div className="space-y-2">
              {drafters.map((drafter, i) => (
                <div key={i} className="relative flex items-center gap-2">
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => moveDrafter(i, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${drafter.name} up`}
                      className="text-xs text-slate-500 hover:text-slate-200 disabled:opacity-20"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDrafter(i, 1)}
                      disabled={i === drafters.length - 1}
                      aria-label={`Move ${drafter.name} down`}
                      className="text-xs text-slate-500 hover:text-slate-200 disabled:opacity-20"
                    >
                      ▼
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStylePickerIndex(stylePickerIndex === i ? null : i)}
                    aria-label={`Change ${drafter.name}'s colour and mascot`}
                    aria-expanded={stylePickerIndex === i}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ring-2 ring-offset-2 ring-offset-arena-900 hover:brightness-125"
                    style={{ background: `${drafter.color}33`, color: drafter.color, '--tw-ring-color': drafter.color } as React.CSSProperties}
                  >
                    {drafter.avatar ?? '＋'}
                  </button>
                  <TextInput value={drafter.name} onChange={(e) => renameDrafter(i, e.target.value)} inputSize="sm" className="w-full" />
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
                  {stylePickerIndex === i && (
                    <>
                      <div className="fixed inset-0 z-0" onClick={() => setStylePickerIndex(null)} />
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-8 top-11 z-10 w-60 space-y-3 rounded-lg border border-arena-600 bg-arena-900 p-3 shadow-xl"
                      >
                        <div>
                          <div className="mb-1.5 text-[11px] uppercase tracking-widest text-slate-500">Colour</div>
                          <div className="flex flex-wrap gap-2">
                            {TEAM_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => styleDrafter(i, { color: c })}
                                aria-label={`Colour ${c}`}
                                aria-pressed={drafter.color === c}
                                className={`h-6 w-6 rounded-full ${drafter.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-arena-900' : ''}`}
                                style={{ background: c }}
                              />
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1.5 text-[11px] uppercase tracking-widest text-slate-500">Mascot</div>
                          <div className="flex flex-wrap gap-1.5">
                            {TEAM_AVATARS.map((a) => (
                              <button
                                key={a}
                                type="button"
                                onClick={() => styleDrafter(i, { avatar: drafter.avatar === a ? undefined : a })}
                                aria-pressed={drafter.avatar === a}
                                className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${drafter.avatar === a ? 'bg-hardwood-500/30 ring-1 ring-hardwood-500' : 'hover:bg-arena-700'}`}
                              >
                                {a}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
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
            <TextInput
              type="number"
              min={1}
              max={20}
              value={picksPerDrafter}
              onChange={(e) => setPicksPerDrafter(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              inputSize="sm"
              className="w-24 text-center"
            />
          </div>

          <div className={`rounded-lg px-3 py-2 text-sm ${notEnough ? 'bg-scoreboard-500/10 text-scoreboard-500' : 'text-slate-500'}`}>
            {needed} song{needed === 1 ? '' : 's'} needed · {availableSongCount} available
            {notEnough ? ' — add more songs to the pool first' : ''}
          </div>
        </div>

        <div className="border-t border-arena-700 px-6 py-3">
          <Button disabled={notEnough} onClick={handleCreate} fullWidth>
            START DRAFT →
          </Button>
        </div>
      </ModalShell>

      {wheelOpen && (
        <DraftOrderWheel
          entries={drafters.map((d) => ({ name: d.name, color: d.color, avatar: d.avatar }))}
          onComplete={applyWheelOrder}
          onClose={() => setWheelOpen(false)}
        />
      )}
    </>
  )
}
