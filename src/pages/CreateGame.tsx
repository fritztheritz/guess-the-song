import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGame, createTeam, teamColorForIndex, type GameMode } from '../types'
import { saveGame } from '../lib/storage/game-repository'

const MIN_TEAMS = 2
const MAX_TEAMS = 8

export default function CreateGame() {
  const navigate = useNavigate()
  const [name, setName] = useState('Friday Night Music Game')
  const [mode, setMode] = useState<GameMode>('song')
  const [teamNames, setTeamNames] = useState(['Team Jordan', 'Team Kobe'])

  function addTeam() {
    if (teamNames.length >= MAX_TEAMS) return
    setTeamNames((prev) => [...prev, `Team ${prev.length + 1}`])
  }

  function removeTeam(index: number) {
    if (teamNames.length <= MIN_TEAMS) return
    setTeamNames((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const teams = teamNames.map((n, i) => createTeam(n.trim() || `Team ${i + 1}`, teamColorForIndex(i)))
    const game = createGame(name.trim() || 'Untitled Game', teams, mode)
    saveGame(game)
    navigate(`/games/${game.id}/edit`)
  }

  return (
    <div className="min-h-svh court-lines flex items-center justify-center px-6 py-16">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="font-display text-4xl tracking-wide text-white">NAME YOUR GAME</h1>
        </div>

        <div>
          <label className="mb-2 block text-sm text-slate-400">Game type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('song')}
              className={`rounded-lg border px-4 py-3 text-left ${
                mode === 'song' ? 'border-hardwood-500 bg-hardwood-500/10' : 'border-arena-600 hover:border-arena-500'
              }`}
            >
              <div className="font-display text-lg tracking-wide text-white">🎵 Guess the Song</div>
              <div className="text-xs text-slate-500">Play SoundCloud clips</div>
            </button>
            <button
              type="button"
              onClick={() => setMode('lyric')}
              className={`rounded-lg border px-4 py-3 text-left ${
                mode === 'lyric' ? 'border-hardwood-500 bg-hardwood-500/10' : 'border-arena-600 hover:border-arena-500'
              }`}
            >
              <div className="font-display text-lg tracking-wide text-white">📝 Guess the Lyric</div>
              <div className="text-xs text-slate-500">Type in lyrics & hints</div>
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-400">Game name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-arena-600 bg-arena-800 px-4 py-3 text-lg text-slate-100 outline-none focus:border-hardwood-500"
            autoFocus
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-slate-400">Choose teams</label>
          <div className="space-y-2">
            {teamNames.map((teamName, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: teamColorForIndex(i) }} />
                <input
                  value={teamName}
                  onChange={(e) => setTeamNames((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)))}
                  className="w-full rounded-lg border border-arena-600 bg-arena-800 px-4 py-2 text-slate-100 outline-none focus:border-hardwood-500"
                />
                {teamNames.length > MIN_TEAMS && (
                  <button
                    type="button"
                    onClick={() => removeTeam(i)}
                    aria-label={`Remove ${teamName}`}
                    className="shrink-0 rounded-lg px-2 py-1 text-slate-500 hover:text-scoreboard-500"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {teamNames.length < MAX_TEAMS && (
            <button
              type="button"
              onClick={addTeam}
              className="mt-2 w-full rounded-lg border border-dashed border-arena-500 py-2 text-sm text-slate-400 hover:border-hardwood-500 hover:text-hardwood-400"
            >
              + Add Team
            </button>
          )}
        </div>

        <button type="submit" className="w-full rounded-full bg-hardwood-500 py-3 text-lg font-semibold text-arena-950 hover:bg-hardwood-400">
          {mode === 'lyric' ? 'ADD LYRIC ROUNDS →' : 'ADD TRACKS →'}
        </button>
      </form>
    </div>
  )
}
