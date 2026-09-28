import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEmptyTournament } from '../types/tournament'
import { saveTournament } from '../lib/storage/tournament-repository'
import TextInput from '../components/ui/TextInput'
import Button from '../components/ui/Button'

export default function CreateTournament() {
  const navigate = useNavigate()
  const [name, setName] = useState('Friday Night Tournament')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const tournament = saveTournament(createEmptyTournament(name.trim() || 'Untitled Tournament'))
    navigate(`/tournaments/${tournament.id}`)
  }

  return (
    <div className="min-h-svh court-lines flex items-center justify-center px-6 py-16">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mb-2 text-4xl">🏆</div>
          <h1 className="font-display text-4xl tracking-wide text-white">NAME YOUR TOURNAMENT</h1>
          <p className="mt-2 text-sm text-slate-400">Chain a few existing games together with one running leaderboard.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-400">Tournament name</label>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} inputSize="lg" className="w-full" autoFocus />
        </div>

        <Button type="submit" fullWidth size="lg">
          ADD GAMES →
        </Button>
      </form>
    </div>
  )
}
