import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listGames, deleteGame, saveGame, exportAllGames, importGames } from '../lib/storage/game-repository'
import { listTierLists, deleteTierList, saveTierList } from '../lib/storage/tierlist-repository'
import { downloadBackupFile, parseBackupFile, BackupFileError } from '../lib/game-backup'
import { duplicateGame, isLyricMode, type Game } from '../types'
import { duplicateTierList, type TierList } from '../types/tierlist'
import { useFeatureFlag } from '../state/FeatureFlagsContext'
import SoundCloudAttribution from '../components/SoundCloudAttribution'

export default function Home() {
  const navigate = useNavigate()
  const tierListsEnabled = useFeatureFlag('tier-lists')
  const [games, setGames] = useState<Game[]>([])
  const [tierLists, setTierLists] = useState<TierList[]>([])
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const importFileInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setGames(listGames())
    if (tierListsEnabled) setTierLists(listTierLists())
  }, [tierListsEnabled])

  function handleDeleteTierList(id: string) {
    if (!confirm('Delete this tier list? This cannot be undone.')) return
    deleteTierList(id)
    setTierLists(listTierLists())
  }

  function handleDuplicateTierList(list: TierList) {
    const copy = saveTierList(duplicateTierList(list))
    navigate(`/tierlists/${copy.id}/edit`)
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this game? This cannot be undone.')) return
    deleteGame(id)
    setGames(listGames())
  }

  function handleDuplicate(game: Game) {
    const copy = saveGame(duplicateGame(game))
    navigate(`/games/${copy.id}/edit`)
  }

  function handleExportAll() {
    const all = exportAllGames()
    if (all.length === 0) {
      setBackupStatus('No games to back up yet.')
      return
    }
    downloadBackupFile(all)
    setBackupStatus(`Downloaded a backup of ${all.length} game${all.length === 1 ? '' : 's'}.`)
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const imported = parseBackupFile(text)
      if (imported.length === 0) {
        setBackupStatus('That backup file has no games in it.')
        return
      }
      if (!confirm(`Restore ${imported.length} game${imported.length === 1 ? '' : 's'}? Any game already here with the same name/id will be overwritten by the backup.`)) {
        return
      }
      const count = importGames(imported)
      setGames(listGames())
      setBackupStatus(`Restored ${count} game${count === 1 ? '' : 's'} from backup.`)
    } catch (err) {
      setBackupStatus(err instanceof BackupFileError ? err.message : 'Could not read that file.')
    }
  }

  return (
    <div className="min-h-svh court-lines">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-center">
          <div className="mb-3 text-5xl">🏀</div>
          <h1 className="font-display text-6xl tracking-wide text-white">GUESS THE TRACK</h1>
          <p className="mt-2 text-slate-400">A music guessing game built from your SoundCloud library.</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/new"
              className="inline-block rounded-full bg-hardwood-500 px-10 py-3 text-lg font-semibold text-arena-950 shadow-lg shadow-hardwood-500/20 hover:bg-hardwood-400"
            >
              + CREATE GAME
            </Link>
            {tierListsEnabled && (
              <Link
                to="/tierlists/new"
                className="inline-block rounded-full border border-arena-500 px-10 py-3 text-lg font-semibold text-slate-200 hover:border-hardwood-500"
              >
                + CREATE TIER LIST
              </Link>
            )}
          </div>
        </div>

        {games.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-4 font-display text-2xl tracking-wide text-slate-300">YOUR GAMES</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {games.map((game) => (
                <div key={game.id} className="flex items-center justify-between rounded-xl border border-arena-600 bg-arena-800/60 p-4">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{isLyricMode(game) ? '📝' : '🎵'}</span>
                      <div className="font-semibold text-slate-100">{game.name}</div>
                    </div>
                    <div className="text-sm text-slate-500">
                      {game.rounds.length} possession{game.rounds.length === 1 ? '' : 's'} · {game.teams.map((t) => t.name).join(' vs ')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/games/${game.id}/edit`} className="rounded-lg border border-arena-500 px-3 py-1.5 text-sm text-slate-200 hover:border-hardwood-500">
                      Edit
                    </Link>
                    <Link to={`/games/${game.id}/present`} className="rounded-lg bg-hardwood-500 px-3 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400">
                      Present
                    </Link>
                    <button
                      onClick={() => handleDuplicate(game)}
                      className="rounded-lg px-2 text-slate-500 hover:text-slate-200"
                      aria-label={`Duplicate ${game.name}`}
                      title="Duplicate"
                    >
                      ⧉
                    </button>
                    <button onClick={() => handleDelete(game.id)} className="rounded-lg px-2 text-slate-500 hover:text-scoreboard-500" aria-label="Delete game">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tierListsEnabled && tierLists.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-4 font-display text-2xl tracking-wide text-slate-300">YOUR TIER LISTS</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {tierLists.map((list) => {
                const ranked = list.songs.filter((s) => s.tierId !== null).length
                return (
                  <div key={list.id} className="flex items-center justify-between rounded-xl border border-arena-600 bg-arena-800/60 p-4">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">🏆</span>
                        <div className="font-semibold text-slate-100">{list.name}</div>
                      </div>
                      <div className="text-sm text-slate-500">
                        {list.songs.length} song{list.songs.length === 1 ? '' : 's'} · {ranked} ranked · {list.tiers.length} tiers
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        to={`/tierlists/${list.id}/edit`}
                        className="rounded-lg border border-arena-500 px-3 py-1.5 text-sm text-slate-200 hover:border-hardwood-500"
                      >
                        Edit
                      </Link>
                      <Link
                        to={`/tierlists/${list.id}/present`}
                        className="rounded-lg bg-hardwood-500 px-3 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400"
                      >
                        Present
                      </Link>
                      <button
                        onClick={() => handleDuplicateTierList(list)}
                        className="rounded-lg px-2 text-slate-500 hover:text-slate-200"
                        aria-label={`Duplicate ${list.name}`}
                        title="Duplicate"
                      >
                        ⧉
                      </button>
                      <button
                        onClick={() => handleDeleteTierList(list.id)}
                        className="rounded-lg px-2 text-slate-500 hover:text-scoreboard-500"
                        aria-label="Delete tier list"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-16 text-center">
          <p className="mb-2 text-xs text-slate-500">
            Games are stored only in this browser. Back them up before clearing site data or switching browsers/devices.
          </p>
          <div className="flex justify-center gap-3">
            <button onClick={handleExportAll} className="text-sm text-slate-400 underline hover:text-hardwood-400">
              Export all games
            </button>
            <button onClick={() => importFileInput.current?.click()} className="text-sm text-slate-400 underline hover:text-hardwood-400">
              Restore from backup
            </button>
          </div>
          <input ref={importFileInput} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
          {backupStatus && <p className="mt-2 text-xs text-slate-400">{backupStatus}</p>}
        </div>

        <div className="mt-8 flex flex-col items-center gap-2">
          <SoundCloudAttribution />
          <Link to="/admin" className="text-xs text-slate-600 hover:text-slate-400">
            Feature flags
          </Link>
        </div>
      </div>
    </div>
  )
}
