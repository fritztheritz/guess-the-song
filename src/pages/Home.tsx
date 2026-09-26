import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listGames, deleteGame, saveGame, exportAllGames, importGames } from '../lib/storage/game-repository'
import { listTierLists, deleteTierList, saveTierList, exportAllTierLists, importTierLists } from '../lib/storage/tierlist-repository'
import {
  listTournaments,
  deleteTournament,
  saveTournament,
  exportAllTournaments,
  importTournaments,
} from '../lib/storage/tournament-repository'
import { downloadBackupFile, parseBackupFile, BackupFileError } from '../lib/game-backup'
import { duplicateGame, isLyricMode, isTierGuessMode, type Game } from '../types'
import { duplicateTierList, type TierList } from '../types/tierlist'
import { duplicateTournament, type Tournament } from '../types/tournament'
import { useFeatureFlag } from '../state/FeatureFlagsContext'
import { useConfirm } from '../state/ConfirmContext'
import { useToast } from '../state/ToastContext'
import SoundCloudAttribution from '../components/SoundCloudAttribution'
import SoundCloudConnectPanel from '../components/SoundCloudConnectPanel'
import SpotifyConnectPanel from '../components/SpotifyConnectPanel'

export default function Home() {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const showToast = useToast()
  const tierListsEnabled = useFeatureFlag('tier-lists')
  const spotifyImportEnabled = useFeatureFlag('spotify-import')
  const tournamentsEnabled = useFeatureFlag('tournaments')
  const [games, setGames] = useState<Game[]>([])
  const [tierLists, setTierLists] = useState<TierList[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [activeTags, setActiveTags] = useState<string[]>([])
  const importFileInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setGames(listGames())
    if (tierListsEnabled) setTierLists(listTierLists())
    if (tournamentsEnabled) setTournaments(listTournaments())
  }, [tierListsEnabled, tournamentsEnabled])

  async function handleDeleteTierList(id: string) {
    if (!(await confirm('Delete this tier list? This cannot be undone.', { danger: true, confirmLabel: 'Delete' }))) return
    deleteTierList(id)
    setTierLists(listTierLists())
    showToast('Tier list deleted')
  }

  function handleDuplicateTierList(list: TierList) {
    const copy = saveTierList(duplicateTierList(list))
    navigate(`/tierlists/${copy.id}/edit`)
  }

  async function handleDeleteTournament(id: string) {
    if (!(await confirm('Delete this tournament? This cannot be undone (the games it references are not deleted).', { danger: true, confirmLabel: 'Delete' })))
      return
    deleteTournament(id)
    setTournaments(listTournaments())
    showToast('Tournament deleted')
  }

  function handleDuplicateTournament(tournament: Tournament) {
    const copy = saveTournament(duplicateTournament(tournament))
    navigate(`/tournaments/${copy.id}`)
  }

  async function handleDelete(id: string) {
    if (!(await confirm('Delete this game? This cannot be undone.', { danger: true, confirmLabel: 'Delete' }))) return
    deleteGame(id)
    setGames(listGames())
    showToast('Game deleted')
  }

  function handleDuplicate(game: Game) {
    const copy = saveGame(duplicateGame(game))
    navigate(`/games/${copy.id}/edit`)
  }

  // Tier Guess rides on the tier-lists flag — fully hidden when it's off, same as the tier
  // lists section below, rather than just blocking its Edit/Present links.
  const modeVisibleGames = tierListsEnabled ? games : games.filter((g) => !isTierGuessMode(g))

  // Shared tag vocabulary across both games and tier lists — one filter bar organizes both
  // sections at once, since a tag like "Friday Night" is just as meaningful for either.
  const allTags = useMemo(() => {
    const set = new Set<string>()
    modeVisibleGames.forEach((g) => (g.tags ?? []).forEach((t) => set.add(t)))
    if (tierListsEnabled) tierLists.forEach((l) => (l.tags ?? []).forEach((t) => set.add(t)))
    if (tournamentsEnabled) tournaments.forEach((t) => (t.tags ?? []).forEach((tag) => set.add(tag)))
    return Array.from(set).sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeVisibleGames, tierLists, tierListsEnabled, tournaments, tournamentsEnabled])

  function toggleTag(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  // OR semantics: matches any selected tag, not all — the more forgiving default when
  // someone's just narrowing down a long list rather than building a precise query.
  const matchesActiveTags = (tags?: string[]) => activeTags.length === 0 || (tags ?? []).some((t) => activeTags.includes(t))
  const visibleGames = modeVisibleGames.filter((g) => matchesActiveTags(g.tags))
  const visibleTierLists = tierLists.filter((l) => matchesActiveTags(l.tags))
  const visibleTournaments = tournaments.filter((t) => matchesActiveTags(t.tags))

  function handleExportAll() {
    // Reads straight from storage rather than the tierLists/tournaments state vars, so a
    // backup taken while a flag is off still includes anything already saved under it.
    const allGames = exportAllGames()
    const allTierLists = exportAllTierLists()
    const allTournaments = exportAllTournaments()
    if (allGames.length === 0 && allTierLists.length === 0 && allTournaments.length === 0) {
      setBackupStatus('Nothing to back up yet.')
      return
    }
    downloadBackupFile(allGames, allTierLists, allTournaments)
    const parts = [
      allGames.length > 0 ? `${allGames.length} game${allGames.length === 1 ? '' : 's'}` : null,
      allTierLists.length > 0 ? `${allTierLists.length} tier list${allTierLists.length === 1 ? '' : 's'}` : null,
      allTournaments.length > 0 ? `${allTournaments.length} tournament${allTournaments.length === 1 ? '' : 's'}` : null,
    ].filter(Boolean)
    setBackupStatus(`Downloaded a backup of ${parts.join(', ')}.`)
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const { games: importedGames, tierLists: importedTierLists, tournaments: importedTournaments } = parseBackupFile(text)
      if (importedGames.length === 0 && importedTierLists.length === 0 && importedTournaments.length === 0) {
        setBackupStatus('That backup file is empty.')
        return
      }
      const parts = [
        importedGames.length > 0 ? `${importedGames.length} game${importedGames.length === 1 ? '' : 's'}` : null,
        importedTierLists.length > 0 ? `${importedTierLists.length} tier list${importedTierLists.length === 1 ? '' : 's'}` : null,
        importedTournaments.length > 0 ? `${importedTournaments.length} tournament${importedTournaments.length === 1 ? '' : 's'}` : null,
      ].filter(Boolean)
      const ok = await confirm(
        `Restore ${parts.join(', ')}? Anything already here with the same id will be overwritten by the backup.`,
        { confirmLabel: 'Restore' },
      )
      if (!ok) return
      importGames(importedGames)
      importTierLists(importedTierLists)
      importTournaments(importedTournaments)
      setGames(listGames())
      if (tierListsEnabled) setTierLists(listTierLists())
      if (tournamentsEnabled) setTournaments(listTournaments())
      setBackupStatus(`Restored ${parts.join(', ')} from backup.`)
    } catch (err) {
      setBackupStatus(err instanceof BackupFileError ? err.message : 'Could not read that file.')
    }
  }

  return (
    <div className="min-h-svh court-lines">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-center">
          <div className="mb-3 text-5xl">🏀</div>
          <h1 className="font-display text-6xl tracking-wide text-white">BUZZER BEATS</h1>
          <p className="mt-2 text-slate-400">A basketball-themed party trivia game — songs, lyrics, years, and rankings.</p>

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
            {tournamentsEnabled && (
              <Link
                to="/tournaments/new"
                className="inline-block rounded-full border border-arena-500 px-10 py-3 text-lg font-semibold text-slate-200 hover:border-hardwood-500"
              >
                + CREATE TOURNAMENT
              </Link>
            )}
          </div>
        </div>

        {games.length === 0 && (
          <div className="mx-auto mt-12 max-w-lg space-y-4">
            <p className="text-center text-sm text-slate-500">
              Games are built from tracks pulled in from a music source below — connect one before creating a game.
            </p>
            <SoundCloudConnectPanel />
            {spotifyImportEnabled && <SpotifyConnectPanel />}
          </div>
        )}

        {allTags.length > 0 && (
          <div className="mx-auto mt-12 flex max-w-2xl flex-wrap items-center justify-center gap-2">
            <span className="text-xs uppercase tracking-widest text-slate-500">Tags</span>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeTags.includes(tag)
                    ? 'bg-hardwood-500 text-arena-950'
                    : 'border border-arena-600 text-slate-300 hover:border-hardwood-500'
                }`}
              >
                {tag}
              </button>
            ))}
            {activeTags.length > 0 && (
              <button onClick={() => setActiveTags([])} className="text-xs text-slate-500 underline hover:text-slate-300">
                Clear
              </button>
            )}
          </div>
        )}

        {modeVisibleGames.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-4 font-display text-2xl tracking-wide text-slate-300">YOUR GAMES</h2>
            {visibleGames.length === 0 ? (
              <p className="text-sm text-slate-500">No games match the selected tags.</p>
            ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {visibleGames.map((game) => {
                const thumbnailUrl = game.rounds.find((r) => r.artworkUrl)?.artworkUrl
                return (
                <div key={game.id} className="flex items-start gap-3 rounded-xl border border-arena-600 bg-arena-800/60 p-4 sm:items-center">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-arena-700">
                    {thumbnailUrl ? (
                      <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl text-arena-500">
                        {isLyricMode(game) ? '📝' : isTierGuessMode(game) ? '🎯' : '🎵'}
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-100">{game.name}</div>
                    <div className="text-sm text-slate-500">
                      {game.rounds.length} possession{game.rounds.length === 1 ? '' : 's'} · {game.teams.map((t) => t.name).join(' vs ')}
                    </div>
                    {game.tags && game.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {game.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-arena-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
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
                </div>
                )
              })}
            </div>
            )}
          </div>
        )}

        {tierListsEnabled && tierLists.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-4 font-display text-2xl tracking-wide text-slate-300">YOUR TIER LISTS</h2>
            {visibleTierLists.length === 0 ? (
              <p className="text-sm text-slate-500">No tier lists match the selected tags.</p>
            ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {visibleTierLists.map((list) => {
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
                      {list.tags && list.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {list.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-arena-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
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
            )}
          </div>
        )}

        {tournamentsEnabled && tournaments.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-4 font-display text-2xl tracking-wide text-slate-300">YOUR TOURNAMENTS</h2>
            {visibleTournaments.length === 0 ? (
              <p className="text-sm text-slate-500">No tournaments match the selected tags.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {visibleTournaments.map((tournament) => (
                  <div key={tournament.id} className="flex items-center justify-between rounded-xl border border-arena-600 bg-arena-800/60 p-4">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">🏆</span>
                        <div className="font-semibold text-slate-100">{tournament.name}</div>
                      </div>
                      <div className="text-sm text-slate-500">
                        {tournament.gameIds.length} game{tournament.gameIds.length === 1 ? '' : 's'}
                      </div>
                      {tournament.tags && tournament.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {tournament.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-arena-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Link
                        to={`/tournaments/${tournament.id}`}
                        className="rounded-lg bg-hardwood-500 px-3 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400"
                      >
                        Open
                      </Link>
                      <button
                        onClick={() => handleDuplicateTournament(tournament)}
                        className="rounded-lg px-2 text-slate-500 hover:text-slate-200"
                        aria-label={`Duplicate ${tournament.name}`}
                        title="Duplicate"
                      >
                        ⧉
                      </button>
                      <button
                        onClick={() => handleDeleteTournament(tournament.id)}
                        className="rounded-lg px-2 text-slate-500 hover:text-scoreboard-500"
                        aria-label="Delete tournament"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-16 text-center">
          <p className="mb-2 text-xs text-slate-500">
            Games are stored only in this browser. Back them up before clearing site data or switching browsers/devices.
          </p>
          <div className="flex justify-center gap-3">
            <button onClick={handleExportAll} className="text-sm text-slate-400 underline hover:text-hardwood-400">
              Export everything
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
