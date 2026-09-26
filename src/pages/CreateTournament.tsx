import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEmptyTournament } from '../types/tournament'
import { saveTournament } from '../lib/storage/tournament-repository'

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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-arena-600 bg-arena-800 px-4 py-3 text-lg text-slate-100 outline-none focus:border-hardwood-500"
            autoFocus
          />
        </div>

        <button type="submit" className="w-full rounded-full bg-hardwood-500 py-3 text-lg font-semibold text-arena-950 hover:bg-hardwood-400">
          ADD GAMES →
        </button>
      </form>
    </div>
  )
}
