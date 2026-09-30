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
import { listDraftBoards, deleteDraftBoard, saveDraftBoard, exportAllDraftBoards, importDraftBoards } from '../lib/storage/draft-repository'
import {
  listPopularityGames,
  deletePopularityGame,
  savePopularityGame,
  exportAllPopularityGames,
  importPopularityGames,
} from '../lib/storage/popularity-repository'
import {
  listTimelineGames,
  deleteTimelineGame,
  saveTimelineGame,
  exportAllTimelineGames,
  importTimelineGames,
} from '../lib/storage/timeline-repository'
import { downloadBackupFile, parseBackupFile, BackupFileError, type BackupContents } from '../lib/game-backup'
import { duplicateGame, isLyricMode, isTierGuessMode, type Game } from '../types'
import { duplicateTierList, type TierList } from '../types/tierlist'
import { duplicateTournament, type Tournament } from '../types/tournament'
import type { DraftBoard } from '../types/draft'
import type { PopularityGame } from '../types/popularity'
import type { TimelineGame } from '../types/timeline'
import { useFeatureFlag } from '../state/feature-flags-context'
import { useConfirm } from '../state/confirm-context'
import { useToast } from '../state/toast-context'
import SoundCloudAttribution from '../components/SoundCloudAttribution'
import SoundCloudConnectPanel from '../components/SoundCloudConnectPanel'
import SpotifyConnectPanel from '../components/SpotifyConnectPanel'
import Panel from '../components/ui/Panel'

function describeBackupContents(contents: BackupContents): string[] {
  const label = (count: number, singular: string, plural = `${singular}s`) =>
    count > 0 ? `${count} ${count === 1 ? singular : plural}` : null
  return [
    label(contents.games.length, 'game'),
    label(contents.tierLists.length, 'tier list'),
    label(contents.tournaments.length, 'tournament'),
    label(contents.draftBoards.length, 'draft'),
    label(contents.popularityGames.length, 'popularity game'),
    label(contents.timelineGames.length, 'timeline game'),
  ].filter((part): part is string => part !== null)
}

export default function Home() {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const showToast = useToast()
  const tierListsEnabled = useFeatureFlag('tier-lists')
  const spotifyImportEnabled = useFeatureFlag('spotify-import')
  const tournamentsEnabled = useFeatureFlag('tournaments')
  const draftEnabled = useFeatureFlag('draft')
  const popularityEnabled = useFeatureFlag('popularity')
  const timelineEnabled = useFeatureFlag('timeline')
  const [games, setGames] = useState<Game[]>([])
  const [tierLists, setTierLists] = useState<TierList[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [draftBoards, setDraftBoards] = useState<DraftBoard[]>([])
  const [popularityGames, setPopularityGames] = useState<PopularityGame[]>([])
  const [timelineGames, setTimelineGames] = useState<TimelineGame[]>([])
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [activeTags, setActiveTags] = useState<string[]>([])
  const importFileInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setGames(listGames())
    if (tierListsEnabled) setTierLists(listTierLists())
    if (tournamentsEnabled) setTournaments(listTournaments())
    if (draftEnabled) setDraftBoards(listDraftBoards())
    if (popularityEnabled) setPopularityGames(listPopularityGames())
    if (timelineEnabled) setTimelineGames(listTimelineGames())
  }, [tierListsEnabled, tournamentsEnabled, draftEnabled, popularityEnabled, timelineEnabled])

  // Delete-then-offer-Undo instead of a confirm dialog, for every "remove one whole item
  // from a library section" action on this page — these are simple, self-contained
  // deletes (the item is either gone or it isn't, nothing else references it by the time
  // it's back), which is exactly what makes a compensating "just re-save it" Undo safe:
  // no confirm dialog interrupts the click, and if it was a mistake there's a few seconds
  // to fix it without one. Restoring bumps `updatedAt` (a normal side effect of any save),
  // so an undone item resurfaces at the top of its list rather than its old position.
  function handleDeleteTierList(id: string) {
    const list = tierLists.find((l) => l.id === id)
    if (!list) return
    deleteTierList(id)
    setTierLists((prev) => prev.filter((l) => l.id !== id))
    showToast(`"${list.name}" deleted`, {
      action: {
        label: 'Undo',
        onAction: () => {
          saveTierList(list)
          setTierLists(listTierLists())
        },
      },
    })
  }

  function handleDuplicateTierList(list: TierList) {
    const copy = saveTierList(duplicateTierList(list))
    navigate(`/tierlists/${copy.id}/edit`)
  }

  function handleDeleteTournament(id: string) {
    const tournament = tournaments.find((t) => t.id === id)
    if (!tournament) return
    deleteTournament(id)
    setTournaments((prev) => prev.filter((t) => t.id !== id))
    showToast(`"${tournament.name}" deleted`, {
      action: {
        label: 'Undo',
        onAction: () => {
          saveTournament(tournament)
          setTournaments(listTournaments())
        },
      },
    })
  }

  function handleDuplicateTournament(tournament: Tournament) {
    const copy = saveTournament(duplicateTournament(tournament))
    navigate(`/tournaments/${copy.id}`)
  }

  function handleDeleteDraftBoard(id: string) {
    const board = draftBoards.find((b) => b.id === id)
    if (!board) return
    deleteDraftBoard(id)
    setDraftBoards((prev) => prev.filter((b) => b.id !== id))
    showToast(`"${board.name}" deleted`, {
      action: {
        label: 'Undo',
        onAction: () => {
          saveDraftBoard(board)
          setDraftBoards(listDraftBoards())
        },
      },
    })
  }

  function handleDelete(id: string) {
    const game = games.find((g) => g.id === id)
    if (!game) return
    deleteGame(id)
    setGames((prev) => prev.filter((g) => g.id !== id))
    showToast(`"${game.name}" deleted`, {
      action: {
        label: 'Undo',
        onAction: () => {
          saveGame(game)
          setGames(listGames())
        },
      },
    })
  }

  function handleDeletePopularityGame(id: string) {
    const game = popularityGames.find((g) => g.id === id)
    if (!game) return
    deletePopularityGame(id)
    setPopularityGames((prev) => prev.filter((g) => g.id !== id))
    showToast(`"${game.name}" deleted`, {
      action: {
        label: 'Undo',
        onAction: () => {
          savePopularityGame(game)
          setPopularityGames(listPopularityGames())
        },
      },
    })
  }

  function handleDeleteTimelineGame(id: string) {
    const game = timelineGames.find((g) => g.id === id)
    if (!game) return
    deleteTimelineGame(id)
    setTimelineGames((prev) => prev.filter((g) => g.id !== id))
    showToast(`"${game.name}" deleted`, {
      action: {
        label: 'Undo',
        onAction: () => {
          saveTimelineGame(game)
          setTimelineGames(listTimelineGames())
        },
      },
    })
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
    if (draftEnabled) draftBoards.forEach((b) => (b.tags ?? []).forEach((tag) => set.add(tag)))
    return Array.from(set).sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeVisibleGames, tierLists, tierListsEnabled, tournaments, tournamentsEnabled, draftBoards, draftEnabled])

  function toggleTag(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  // OR semantics: matches any selected tag, not all — the more forgiving default when
  // someone's just narrowing down a long list rather than building a precise query.
  const matchesActiveTags = (tags?: string[]) => activeTags.length === 0 || (tags ?? []).some((t) => activeTags.includes(t))
  const visibleGames = modeVisibleGames.filter((g) => matchesActiveTags(g.tags))
  const visibleTierLists = tierLists.filter((l) => matchesActiveTags(l.tags))
  const visibleTournaments = tournaments.filter((t) => matchesActiveTags(t.tags))
  const visibleDraftBoards = draftBoards.filter((b) => matchesActiveTags(b.tags))

  function handleExportAll() {
    // Reads straight from storage rather than the tierLists/tournaments/draftBoards state
    // vars, so a backup taken while a flag is off still includes anything already saved under it.
    const allGames = exportAllGames()
    const allTierLists = exportAllTierLists()
    const allTournaments = exportAllTournaments()
    const allDraftBoards = exportAllDraftBoards()
    const allPopularityGames = exportAllPopularityGames()
    const allTimelineGames = exportAllTimelineGames()
    const contents = {
      games: allGames,
      tierLists: allTierLists,
      tournaments: allTournaments,
      draftBoards: allDraftBoards,
      popularityGames: allPopularityGames,
      timelineGames: allTimelineGames,
    }
    if (Object.values(contents).every((list) => list.length === 0)) {
      setBackupStatus('Nothing to back up yet.')
      return
    }
    downloadBackupFile(contents)
    const parts = describeBackupContents(contents)
    setBackupStatus(`Downloaded a backup of ${parts.join(', ')}.`)
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const imported = parseBackupFile(text)
      if (Object.values(imported).every((list) => list.length === 0)) {
        setBackupStatus('That backup file is empty.')
        return
      }
      const parts = describeBackupContents(imported)
      const ok = await confirm(
        `Restore ${parts.join(', ')}? Anything already here with the same id will be overwritten by the backup.`,
        { confirmLabel: 'Restore' },
      )
      if (!ok) return
      importGames(imported.games)
      importTierLists(imported.tierLists)
      importTournaments(imported.tournaments)
      importDraftBoards(imported.draftBoards)
      importPopularityGames(imported.popularityGames)
      importTimelineGames(imported.timelineGames)
      setGames(listGames())
      if (tierListsEnabled) setTierLists(listTierLists())
      if (tournamentsEnabled) setTournaments(listTournaments())
      if (draftEnabled) setDraftBoards(listDraftBoards())
      if (popularityEnabled) setPopularityGames(listPopularityGames())
      if (timelineEnabled) setTimelineGames(listTimelineGames())
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
            {draftEnabled && (
              <Link
                to="/drafts/new"
                className="inline-block rounded-full border border-arena-500 px-10 py-3 text-lg font-semibold text-slate-200 hover:border-hardwood-500"
              >
                + CREATE DRAFT
              </Link>
            )}
            {popularityEnabled && (
              <Link
                to="/popularity/new"
                className="inline-block rounded-full border border-arena-500 px-10 py-3 text-lg font-semibold text-slate-200 hover:border-hardwood-500"
              >
                + GUESS THE POPULARITY
              </Link>
            )}
            {timelineEnabled && (
              <Link
                to="/timeline/new"
                className="inline-block rounded-full border border-arena-500 px-10 py-3 text-lg font-semibold text-slate-200 hover:border-hardwood-500"
              >
                + GUESS THE TIMELINE
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
                <Panel key={game.id} padding="md" className="flex items-start gap-3 sm:items-center">
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
                </Panel>
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
                  <Panel key={list.id} className="flex items-center justify-between">
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
                  </Panel>
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
                  <Panel key={tournament.id} className="flex items-center justify-between">
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
                  </Panel>
                ))}
              </div>
            )}
          </div>
        )}

        {draftEnabled && draftBoards.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-4 font-display text-2xl tracking-wide text-slate-300">YOUR DRAFTS</h2>
            {visibleDraftBoards.length === 0 ? (
              <p className="text-sm text-slate-500">No drafts match the selected tags.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {visibleDraftBoards.map((board) => {
                  const available = board.songPool.filter((s) => !s.takenBySessionId).length
                  return (
                    <Panel key={board.id} className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">🎧</span>
                          <div className="font-semibold text-slate-100">{board.name}</div>
                        </div>
                        <div className="text-sm text-slate-500">
                          {available} song{available === 1 ? '' : 's'} available · {board.sessions.length} session{board.sessions.length === 1 ? '' : 's'}
                        </div>
                        {board.tags && board.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {board.tags.map((tag) => (
                              <span key={tag} className="rounded-full bg-arena-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Link
                          to={`/drafts/${board.id}`}
                          className="rounded-lg bg-hardwood-500 px-3 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400"
                        >
                          Open
                        </Link>
                        <button
                          onClick={() => handleDeleteDraftBoard(board.id)}
                          className="rounded-lg px-2 text-slate-500 hover:text-scoreboard-500"
                          aria-label="Delete draft"
                        >
                          ✕
                        </button>
                      </div>
                    </Panel>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {popularityEnabled && popularityGames.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-4 font-display text-2xl tracking-wide text-slate-300">YOUR POPULARITY GAMES</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {popularityGames.map((game) => {
                const solvedCount = Object.keys(game.progress.solved).length
                return (
                  <Panel key={game.id} className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">📈</span>
                        <div className="font-semibold text-slate-100">{game.name}</div>
                      </div>
                      <div className="text-sm text-slate-500">
                        {game.artistName} · {solvedCount}/{game.ranks.length} ranks solved
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        to={`/popularity/${game.id}/present`}
                        className="rounded-lg bg-hardwood-500 px-3 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400"
                      >
                        {game.progress.completed ? 'View' : solvedCount > 0 ? 'Continue' : 'Play'}
                      </Link>
                      <button
                        onClick={() => handleDeletePopularityGame(game.id)}
                        className="rounded-lg px-2 text-slate-500 hover:text-scoreboard-500"
                        aria-label="Delete game"
                      >
                        ✕
                      </button>
                    </div>
                  </Panel>
                )
              })}
            </div>
          </div>
        )}

        {timelineEnabled && timelineGames.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-4 font-display text-2xl tracking-wide text-slate-300">YOUR TIMELINE GAMES</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {timelineGames.map((game) => {
                const placedCount = game.progress.timeline.length - 1
                return (
                  <Panel key={game.id} className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">🕰️</span>
                        <div className="font-semibold text-slate-100">{game.name}</div>
                      </div>
                      <div className="text-sm text-slate-500">
                        {game.songs.length} songs · {placedCount} placed
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        to={`/timeline/${game.id}/present`}
                        className="rounded-lg bg-hardwood-500 px-3 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400"
                      >
                        {game.progress.completed ? 'View' : game.progress.deckIndex > 1 ? 'Continue' : 'Play'}
                      </Link>
                      <button
                        onClick={() => handleDeleteTimelineGame(game.id)}
                        className="rounded-lg px-2 text-slate-500 hover:text-scoreboard-500"
                        aria-label="Delete game"
                      >
                        ✕
                      </button>
                    </div>
                  </Panel>
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
          <div className="flex items-center gap-3">
            <Link to="/stats" className="text-xs text-slate-600 hover:text-slate-400">
              Stats
            </Link>
            <Link to="/admin" className="text-xs text-slate-600 hover:text-slate-400">
              Feature flags
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
