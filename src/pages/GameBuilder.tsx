import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Game, SongRound } from '../types'
import { createEmptyRound, createTeam, teamColorForIndex } from '../types'
import { getGame, saveGame } from '../lib/storage/game-repository'
import ImportSoundCloudModal from '../components/ImportSoundCloudModal'
import ClipEditor from '../components/ClipEditor'
import type { ImportableTrack } from '../lib/soundcloud/soundcloud-tracks'

const MIN_TEAMS = 2
const MAX_TEAMS = 8

export default function GameBuilder() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState<Game | null>(null)
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const dragIndex = useRef<number | null>(null)
  const localFileInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!gameId) return
    const loaded = getGame(gameId)
    setGame(loaded)
    setSelectedRoundId(loaded?.rounds[0]?.id ?? null)
  }, [gameId])

  const selectedRound = useMemo(() => game?.rounds.find((r) => r.id === selectedRoundId) ?? null, [game, selectedRoundId])

  function persist(next: Game) {
    const saved = saveGame(next)
    setGame(saved)
  }

  function updateRound(updated: SongRound) {
    if (!game) return
    persist({ ...game, rounds: game.rounds.map((r) => (r.id === updated.id ? updated : r)) })
  }

  function removeRound(id: string) {
    if (!game) return
    const rounds = game.rounds.filter((r) => r.id !== id)
    persist({ ...game, rounds })
    if (selectedRoundId === id) setSelectedRoundId(rounds[0]?.id ?? null)
  }

  function duplicateRound(round: SongRound) {
    if (!game) return
    const copy: SongRound = { ...round, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    const index = game.rounds.findIndex((r) => r.id === round.id)
    const rounds = [...game.rounds.slice(0, index + 1), copy, ...game.rounds.slice(index + 1)]
    persist({ ...game, rounds })
    setSelectedRoundId(copy.id)
  }

  function handleImport(tracks: ImportableTrack[]) {
    if (!game) return
    const newRounds = tracks.map((t) =>
      createEmptyRound({
        source: 'soundcloud',
        title: t.title,
        artist: t.artist,
        artworkUrl: t.artworkUrl,
        soundcloudTrackId: t.soundcloudTrackId,
        soundcloudUrn: t.soundcloudUrn,
        soundcloudUrl: t.soundcloudUrl,
        isPrivate: t.isPrivate,
        access: t.access,
        duration: t.duration,
      }),
    )
    const rounds = [...game.rounds, ...newRounds]
    persist({ ...game, rounds })
    setSelectedRoundId(newRounds[0]?.id ?? selectedRoundId)
  }

  function handleAddLocalFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !game) return
    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    audio.addEventListener('loadedmetadata', () => {
      const round = createEmptyRound({
        source: 'local',
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: 'Local file',
        localAudioUrl: url,
        duration: Math.round(audio.duration),
        access: 'playable',
      })
      persist({ ...game, rounds: [...game.rounds, round] })
      setSelectedRoundId(round.id)
    })
    e.target.value = ''
  }

  function shuffleRounds() {
    if (!game) return
    const rounds = [...game.rounds]
    for (let i = rounds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[rounds[i], rounds[j]] = [rounds[j], rounds[i]]
    }
    persist({ ...game, rounds })
  }

  function reorder(from: number, to: number) {
    if (!game) return
    const rounds = [...game.rounds]
    const [moved] = rounds.splice(from, 1)
    rounds.splice(to, 0, moved)
    persist({ ...game, rounds })
  }

  function renameTeam(id: string, name: string) {
    if (!game) return
    persist({ ...game, teams: game.teams.map((t) => (t.id === id ? { ...t, name } : t)) })
  }

  function addTeam() {
    if (!game || game.teams.length >= MAX_TEAMS) return
    const team = createTeam(`Team ${game.teams.length + 1}`, teamColorForIndex(game.teams.length))
    persist({ ...game, teams: [...game.teams, team] })
  }

  function removeTeam(id: string) {
    if (!game || game.teams.length <= MIN_TEAMS) return
    persist({ ...game, teams: game.teams.filter((t) => t.id !== id) })
  }

  if (!game) {
    return (
      <div className="flex min-h-svh items-center justify-center text-slate-400">
        Game not found. <Link to="/" className="ml-2 text-hardwood-400 underline">Back home</Link>
      </div>
    )
  }

  return (
    <div className="flex h-svh flex-col bg-arena-950">
      <header className="flex items-center justify-between border-b border-arena-700 px-6 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-slate-500 hover:text-slate-300">←</Link>
          <input
            value={game.name}
            onChange={(e) => persist({ ...game, name: e.target.value })}
            className="bg-transparent font-display text-2xl tracking-wide text-white outline-none"
          />
        </div>
        <button
          disabled={game.rounds.length === 0}
          onClick={() => navigate(`/games/${game.id}/present`)}
          className="rounded-full bg-hardwood-500 px-6 py-2 font-semibold text-arena-950 disabled:opacity-30 hover:bg-hardwood-400"
        >
          PRESENT ▶
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-arena-700 bg-arena-900/60 p-3">
          {game.rounds.map((round, i) => (
            <div
              key={round.id}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex.current !== null && dragIndex.current !== i) reorder(dragIndex.current, i)
                dragIndex.current = null
              }}
              onClick={() => setSelectedRoundId(round.id)}
              className={`group mb-2 flex cursor-pointer items-center gap-2 rounded-lg border p-2 ${
                selectedRoundId === round.id ? 'border-hardwood-500 bg-arena-800' : 'border-arena-700 hover:border-arena-600'
              }`}
            >
              <span className="w-5 text-center text-xs text-slate-500">{i + 1}</span>
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-arena-700">
                {round.artworkUrl && <img src={round.artworkUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-100">{round.title}</div>
                <div className="truncate text-xs text-slate-500">{round.artist}</div>
              </div>
              <div className="hidden flex-col gap-1 group-hover:flex">
                <button onClick={(e) => { e.stopPropagation(); duplicateRound(round) }} className="text-xs text-slate-500 hover:text-slate-200" title="Duplicate">⧉</button>
                <button onClick={(e) => { e.stopPropagation(); removeRound(round.id) }} className="text-xs text-slate-500 hover:text-scoreboard-500" title="Delete">✕</button>
              </div>
            </div>
          ))}

          <div className="mt-2 space-y-2">
            <button
              onClick={() => setImportOpen(true)}
              className="w-full rounded-lg border border-dashed border-hardwood-500/50 py-2 text-sm font-medium text-hardwood-400 hover:bg-hardwood-500/10"
            >
              + ADD FROM SOUNDCLOUD
            </button>
            <div className="flex gap-2">
              <button onClick={() => localFileInput.current?.click()} className="flex-1 rounded-lg border border-arena-600 py-1.5 text-xs text-slate-400 hover:border-arena-500">
                + Local audio
              </button>
              {game.rounds.length > 1 && (
                <button onClick={shuffleRounds} className="flex-1 rounded-lg border border-arena-600 py-1.5 text-xs text-slate-400 hover:border-arena-500">
                  Shuffle
                </button>
              )}
            </div>
            <input ref={localFileInput} type="file" accept="audio/*" className="hidden" onChange={handleAddLocalFile} />
          </div>

          <div className="mt-6 border-t border-arena-700 pt-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Teams</div>
            <div className="space-y-1.5">
              {game.teams.map((team) => (
                <div key={team.id} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: team.color }} />
                  <input
                    value={team.name}
                    onChange={(e) => renameTeam(team.id, e.target.value)}
                    className="w-full rounded-md border border-arena-700 bg-arena-800 px-2 py-1 text-sm text-slate-100 outline-none focus:border-hardwood-500"
                  />
                  {game.teams.length > MIN_TEAMS && (
                    <button
                      onClick={() => removeTeam(team.id)}
                      aria-label={`Remove ${team.name}`}
                      className="shrink-0 text-xs text-slate-500 hover:text-scoreboard-500"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            {game.teams.length < MAX_TEAMS && (
              <button
                onClick={addTeam}
                className="mt-2 w-full rounded-lg border border-dashed border-arena-600 py-1.5 text-xs text-slate-400 hover:border-hardwood-500 hover:text-hardwood-400"
              >
                + Add Team
              </button>
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-8">
          {!selectedRound ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-slate-400">
              <p>No possessions yet. Import tracks from SoundCloud to get started.</p>
              <button onClick={() => setImportOpen(true)} className="rounded-full bg-hardwood-500 px-6 py-2.5 font-semibold text-arena-950 hover:bg-hardwood-400">
                + ADD FROM SOUNDCLOUD
              </button>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-arena-700 shadow-lg">
                  {selectedRound.artworkUrl && <img src={selectedRound.artworkUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    value={selectedRound.title}
                    onChange={(e) => updateRound({ ...selectedRound, title: e.target.value })}
                    className="w-full bg-transparent text-2xl font-semibold text-slate-100 outline-none"
                  />
                  <input
                    value={selectedRound.artist}
                    onChange={(e) => updateRound({ ...selectedRound, artist: e.target.value })}
                    className="w-full bg-transparent text-slate-400 outline-none"
                  />
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    {selectedRound.source === 'soundcloud' ? (
                      <span className="rounded bg-hardwood-500/15 px-2 py-0.5 text-hardwood-400">SoundCloud</span>
                    ) : (
                      <span className="rounded bg-arena-600 px-2 py-0.5 text-slate-300">Local audio</span>
                    )}
                    {selectedRound.isPrivate && <span className="rounded bg-arena-600 px-2 py-0.5 text-slate-300">🔒 Private</span>}
                    {selectedRound.soundcloudUrl && (
                      <a href={selectedRound.soundcloudUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-hardwood-400">
                        View on SoundCloud ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <ClipEditor round={selectedRound} onChange={updateRound} />
            </div>
          )}
        </main>
      </div>

      {importOpen && <ImportSoundCloudModal onClose={() => setImportOpen(false)} onImport={handleImport} />}
    </div>
  )
}
