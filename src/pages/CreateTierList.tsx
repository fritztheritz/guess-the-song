import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEmptyTierList } from '../types/tierlist'
import { saveTierList } from '../lib/storage/tierlist-repository'

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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-arena-600 bg-arena-800 px-4 py-3 text-lg text-slate-100 outline-none focus:border-hardwood-500"
            autoFocus
          />
        </div>

        <button type="submit" className="w-full rounded-full bg-hardwood-500 py-3 text-lg font-semibold text-arena-950 hover:bg-hardwood-400">
          ADD SONGS & TIERS →
        </button>
      </form>
    </div>
  )
}
