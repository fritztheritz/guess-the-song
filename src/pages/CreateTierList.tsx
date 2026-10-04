import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEmptyTierList, TIER_PRESETS } from '../types/tierlist'
import { saveTierList } from '../lib/storage/tierlist-repository'
import TextInput from '../components/ui/TextInput'
import Button from '../components/ui/Button'

export default function CreateTierList() {
  const navigate = useNavigate()
  const [name, setName] = useState('My Tier List')
  const [presetId, setPresetId] = useState(TIER_PRESETS[0].id)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const list = saveTierList(createEmptyTierList(name.trim() || 'Untitled Tier List', TIER_PRESETS.find((p) => p.id === presetId)?.names))
    navigate(`/tierlists/${list.id}/edit`, { state: { addSongs: true } })
  }

  return (
    <div className="min-h-svh court-lines flex items-center justify-center px-6 py-16">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mb-2 text-4xl">🏆</div>
          <h1 className="font-display text-4xl tracking-wide text-white">NAME YOUR TIER LIST</h1>
          <p className="mt-2 text-sm text-slate-400">Pick songs, set your tiers, then rank them live.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-400">Tier list name</label>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} inputSize="lg" className="w-full" autoFocus />
        </div>

        <div>
          <label className="mb-2 block text-sm text-slate-400">Tiers</label>
          <div className="flex flex-wrap gap-2">
            {TIER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPresetId(preset.id)}
                aria-pressed={presetId === preset.id}
                className={`rounded-full border px-4 py-1.5 text-sm ${presetId === preset.id ? 'border-hardwood-500 bg-hardwood-500/15 text-hardwood-400' : 'border-arena-500 text-slate-300 hover:border-hardwood-500'}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">You can rename, recolour and reorder them next.</p>
        </div>

        <Button type="submit" fullWidth size="lg">
          ADD SONGS & TIERS →
        </Button>
      </form>
    </div>
  )
}
