import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEmptyTierList } from '../types/tierlist'
import { saveTierList } from '../lib/storage/tierlist-repository'
import TextInput from '../components/ui/TextInput'
import Button from '../components/ui/Button'

export default function CreateTierList() {
  const navigate = useNavigate()
  const [name, setName] = useState('My Tier List')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const list = saveTierList(createEmptyTierList(name.trim() || 'Untitled Tier List'))
    navigate(`/tierlists/${list.id}/edit`)
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

        <Button type="submit" fullWidth size="lg">
          ADD SONGS & TIERS →
        </Button>
      </form>
    </div>
  )
}
