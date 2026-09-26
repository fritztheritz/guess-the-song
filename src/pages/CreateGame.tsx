import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGame, createTeam, teamColorForIndex, type GameMode } from '../types'
import { saveGame } from '../lib/storage/game-repository'
import { listTeamPresets, type TeamPreset } from '../lib/team-presets'
import { useFeatureFlag } from '../state/FeatureFlagsContext'

const MIN_TEAMS = 2
const MAX_TEAMS = 8

interface DraftTeam {
  name: string
  color: string
  avatar?: string
}

function draftTeam(index: number): DraftTeam {
  return { name: index === 0 ? 'Team Jordan' : index === 1 ? 'Team Kobe' : `Team ${index + 1}`, color: teamColorForIndex(index) }
}

export default function CreateGame() {
  const navigate = useNavigate()
  const tierListsEnabled = useFeatureFlag('tier-lists')
  const [name, setName] = useState('Friday Night Music Game')
  const [mode, setMode] = useState<GameMode>('song')
  const [teams, setTeams] = useState<DraftTeam[]>([draftTeam(0), draftTeam(1)])
  const [presetPickerIndex, setPresetPickerIndex] = useState<number | null>(null)
  const presets = useMemo(() => listTeamPresets(), [])

  function addTeam() {
    if (teams.length >= MAX_TEAMS) return
    setTeams((prev) => [...prev, draftTeam(prev.length)])
  }

  function removeTeam(index: number) {
    if (teams.length <= MIN_TEAMS) return
    setTeams((prev) => prev.filter((_, i) => i !== index))
  }

  function renameTeam(index: number, value: string) {
    setTeams((prev) => prev.map((t, i) => (i === index ? { ...t, name: value } : t)))
  }

  function applyPreset(index: number, preset: TeamPreset) {
    setTeams((prev) => prev.map((t, i) => (i === index ? { ...t, name: preset.name, color: preset.color, avatar: preset.avatar } : t)))
    setPresetPickerIndex(null)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const finalTeams = teams.map((t, i) => createTeam(t.name.trim() || `Team ${i + 1}`, t.color, t.avatar))
    const game = createGame(name.trim() || 'Untitled Game', finalTeams, mode)
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
            <button
              type="button"
              onClick={() => setMode('year')}
              className={`col-span-2 rounded-lg border px-4 py-3 text-left ${
                mode === 'year' ? 'border-hardwood-500 bg-hardwood-500/10' : 'border-arena-600 hover:border-arena-500'
              }`}
            >
              <div className="font-display text-lg tracking-wide text-white">📅 Guess the Year</div>
              <div className="text-xs text-slate-500">Play a clip, then guess the release year, then the month</div>
            </button>
            {tierListsEnabled && (
              <button
                type="button"
                onClick={() => setMode('tierguess')}
                className={`col-span-2 rounded-lg border px-4 py-3 text-left ${
                  mode === 'tierguess' ? 'border-hardwood-500 bg-hardwood-500/10' : 'border-arena-600 hover:border-arena-500'
                }`}
              >
                <div className="font-display text-lg tracking-wide text-white">🎯 Guess the Ranking</div>
                <div className="text-xs text-slate-500">Built from one of your tier lists — guess where each song landed</div>
              </button>
            )}
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
            {teams.map((team, i) => (
              <div key={i} className="relative flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs" style={{ background: `${team.color}33`, color: team.color }}>
                  {team.avatar ?? ''}
                </span>
                <input
                  value={team.name}
                  onChange={(e) => renameTeam(i, e.target.value)}
                  className="w-full rounded-lg border border-arena-600 bg-arena-800 px-4 py-2 text-slate-100 outline-none focus:border-hardwood-500"
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
                {teams.length > MIN_TEAMS && (
                  <button
                    type="button"
                    onClick={() => removeTeam(i)}
                    aria-label={`Remove ${team.name}`}
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
          {teams.length < MAX_TEAMS && (
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
          {mode === 'lyric' ? 'ADD LYRIC ROUNDS →' : mode === 'tierguess' ? 'PICK YOUR TIER LIST →' : 'ADD TRACKS →'}
        </button>
      </form>
    </div>
  )
}
