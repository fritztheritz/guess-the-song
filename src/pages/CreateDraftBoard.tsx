import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEmptyDraftBoard } from '../types/draft'
import { saveDraftBoard } from '../lib/storage/draft-repository'
import TextInput from '../components/ui/TextInput'
import Button from '../components/ui/Button'

export default function CreateDraftBoard() {
  const navigate = useNavigate()
  const [name, setName] = useState('Friday Night Draft')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const board = saveDraftBoard(createEmptyDraftBoard(name.trim() || 'Untitled Draft'))
    navigate(`/drafts/${board.id}`)
  }

  return (
    <div className="min-h-svh court-lines flex items-center justify-center px-6 py-16">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mb-2 text-4xl">🎧</div>
          <h1 className="font-display text-4xl tracking-wide text-white">NAME YOUR DRAFT</h1>
          <p className="mt-2 text-sm text-slate-400">
            Build a shared song pool, then run one or more snake drafts against it — a song picked in any of them is
            off the board for the rest.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-400">Draft name</label>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} inputSize="lg" className="w-full" autoFocus />
        </div>

        <Button type="submit" fullWidth size="lg">
          BUILD THE POOL →
        </Button>
      </form>
    </div>
  )
}
