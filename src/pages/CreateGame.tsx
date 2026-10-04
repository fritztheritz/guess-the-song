import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGame, createTeam, teamColorForIndex, TEAM_AVATARS, TEAM_COLORS, type GameMode } from '../types'
import { randomTeams } from '../lib/team-names'
import { saveGame } from '../lib/storage/game-repository'
import { listTeamPresets, type TeamPreset } from '../lib/team-presets'
import { findDuplicateTeamName } from '../lib/team-name-conflicts'
import { useFeatureFlag } from '../state/feature-flags-context'
import TextInput from '../components/ui/TextInput'
import Button from '../components/ui/Button'

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
  const powerUpsEnabled = useFeatureFlag('power-ups')
  const [name, setName] = useState('Friday Night Music Game')
  const [mode, setMode] = useState<GameMode>('song')
  // Opt-in, never on by default — see Game.earnedPowerUps.
  const [earnedPowerUps, setEarnedPowerUps] = useState(false)
  // Also opt-in — see Game.catchUp.
  const [catchUp, setCatchUp] = useState(false)
  const [teams, setTeams] = useState<DraftTeam[]>([draftTeam(0), draftTeam(1)])
  const [presetPickerIndex, setPresetPickerIndex] = useState<number | null>(null)
  // Which team's colour/mascot picker is open (inline, so styling a team doesn't wait for the builder).
  const [stylePickerIndex, setStylePickerIndex] = useState<number | null>(null)
  const presets = useMemo(() => listTeamPresets(), [])
  const duplicateTeamName = useMemo(() => findDuplicateTeamName(teams.map((t) => t.name)), [teams])

  function addTeam() {
    if (teams.length >= MAX_TEAMS) return
    setTeams((prev) => [...prev, draftTeam(prev.length)])
  }

  // Jump straight to N teams, keeping the ones already filled in.
  function setTeamCount(count: number) {
    setTeams((prev) => (count <= prev.length ? prev.slice(0, count) : [...prev, ...Array.from({ length: count - prev.length }, (_, k) => draftTeam(prev.length + k))]))
    setStylePickerIndex(null)
  }

  function randomizeTeams() {
    setTeams(randomTeams(teams.length))
    setStylePickerIndex(null)
  }

  function styleTeam(index: number, patch: Partial<DraftTeam>) {
    setTeams((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)))
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

  // Power-ups only exist for the buzz-race modes (Song/Lyric).
  const showEarnedOption = powerUpsEnabled && (mode === 'song' || mode === 'lyric')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const finalTeams = teams.map((t, i) => createTeam(t.name.trim() || `Team ${i + 1}`, t.color, t.avatar))
    const game = createGame(name.trim() || 'Untitled Game', finalTeams, mode)
    if (earnedPowerUps && showEarnedOption) game.earnedPowerUps = true
    if (catchUp && (mode === 'song' || mode === 'lyric')) game.catchUp = true
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
          <TextInput value={name} onChange={(e) => setName(e.target.value)} inputSize="lg" className="w-full" autoFocus />
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm text-slate-400">Choose teams</label>
            <div className="flex items-center gap-1.5">
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTeamCount(n)}
                  aria-pressed={teams.length === n}
                  aria-label={`${n} teams`}
                  className={`h-7 w-7 rounded-full text-xs font-semibold ${
                    teams.length === n ? 'bg-hardwood-500 text-arena-950' : 'border border-arena-600 text-slate-400 hover:border-hardwood-500'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={randomizeTeams}
                className="ml-1 rounded-full border border-arena-600 px-3 py-1 text-xs text-slate-300 hover:border-hardwood-500 hover:text-hardwood-400"
                title="Give every team a random name and mascot"
              >
                🎲 Randomize
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {teams.map((team, i) => (
              <div key={i} className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStylePickerIndex(stylePickerIndex === i ? null : i)}
                  aria-label={`Change ${team.name}'s colour and mascot`}
                  aria-expanded={stylePickerIndex === i}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ring-2 ring-offset-2 ring-offset-arena-950 hover:brightness-125"
                  style={{ background: `${team.color}33`, color: team.color, '--tw-ring-color': team.color } as React.CSSProperties}
                >
                  {team.avatar ?? '＋'}
                </button>
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
                {stylePickerIndex === i && (
                  <>
                    <div className="fixed inset-0 z-0" onClick={() => setStylePickerIndex(null)} />
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-11 z-10 w-64 space-y-3 rounded-lg border border-arena-600 bg-arena-900 p-3 shadow-xl"
                    >
                      <div>
                        <div className="mb-1.5 text-[11px] uppercase tracking-widest text-slate-500">Colour</div>
                        <div className="flex flex-wrap gap-2">
                          {TEAM_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => styleTeam(i, { color: c })}
                              aria-label={`Colour ${c}`}
                              aria-pressed={team.color === c}
                              className={`h-6 w-6 rounded-full ${team.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-arena-900' : ''}`}
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
                              onClick={() => styleTeam(i, { avatar: team.avatar === a ? undefined : a })}
                              aria-pressed={team.avatar === a}
                              className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${team.avatar === a ? 'bg-hardwood-500/30 ring-1 ring-hardwood-500' : 'hover:bg-arena-700'}`}
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
          {teams.length < MAX_TEAMS && (
            <button
              type="button"
              onClick={addTeam}
              className="mt-2 w-full rounded-lg border border-dashed border-arena-500 py-2 text-sm text-slate-400 hover:border-hardwood-500 hover:text-hardwood-400"
            >
              + Add Team
            </button>
          )}
          {duplicateTeamName && (
            <p className="mt-2 text-xs text-scoreboard-amber">
              ⚠️ Two teams are both named "{duplicateTeamName}" — that'll look confusing on the scoreboard, and Stats merges teams with
              the same name together across games.
            </p>
          )}
        </div>

        {showEarnedOption && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-arena-600 p-3">
            <input
              type="checkbox"
              checked={earnedPowerUps}
              onChange={(e) => setEarnedPowerUps(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-arena-600 bg-arena-800 accent-hardwood-500"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-200">🎁 Earn power-ups as you play</span>
              <span className="block text-xs text-slate-500">
                Teams start with none and earn a random Double, Steal, or Freeze for every second scored possession in a row. Off =
                everyone gets a fixed stock up front.
              </span>
            </span>
          </label>
        )}

        {(mode === 'song' || mode === 'lyric') && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-arena-600 p-3">
            <input
              type="checkbox"
              checked={catchUp}
              onChange={(e) => setCatchUp(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-arena-600 bg-arena-800 accent-hardwood-500"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-200">🐕 Underdog catch-up</span>
              <span className="block text-xs text-slate-500">
                A team trailing by 8+ scores a bonus point on a correct answer, and the first time one falls 12+ behind it's gifted a
                free Steal (when Power-Ups is on). Off by default.
              </span>
            </span>
          </label>
        )}
        {mode !== 'song' && mode !== 'lyric' && (
          <p className="text-xs text-slate-500">
            Power-ups and underdog catch-up are only available in Song and Lyric games — other modes can credit several teams per
            possession, so there's no single winner for them to apply to.
          </p>
        )}

        <Button type="submit" fullWidth size="lg">
          {mode === 'lyric' ? 'ADD LYRIC ROUNDS →' : mode === 'tierguess' ? 'PICK YOUR TIER LIST →' : 'ADD TRACKS →'}
        </Button>
      </form>
    </div>
  )
}
