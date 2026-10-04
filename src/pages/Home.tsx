import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import ButtonLink from '../components/ui/ButtonLink'
import { summarizeDraftBoard } from '../lib/draft-summary'
import HomeSection from '../components/HomeSection'
import EmptyState from '../components/ui/EmptyState'
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
import { listSeasons, deleteSeason, saveSeason, exportAllSeasons, importSeasons } from '../lib/storage/season-repository'
import { downloadBackupFile, parseBackupFile, BackupFileError, type BackupContents } from '../lib/game-backup'
import { duplicateGame, isLyricMode, isTierGuessMode, type Game } from '../types'
import { duplicateTierList, type TierList } from '../types/tierlist'
import { duplicateTournament, type Tournament } from '../types/tournament'
import { duplicateSeason, type Season } from '../types/season'
import type { DraftBoard } from '../types/draft'
import type { PopularityGame } from '../types/popularity'
import type { TimelineGame } from '../types/timeline'
import { useFeatureFlag } from '../state/feature-flags-context'
import { useConfirm } from '../state/confirm-context'
import { useToast } from '../state/toast-context'
import ThemePicker from '../components/ThemePicker'
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
    label(contents.seasons.length, 'season'),
  ].filter((part): part is string => part !== null)
}

/** "3 days ago"-style label for a saved timestamp. */
function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString()
}

/** Where a game stands: not played, mid-game (with how far), or finished (with the winner). */
function gameStatus(game: Game): { text: string; tone: 'idle' | 'live' | 'done' } {
  if (!game.progress) return { text: 'Not played yet', tone: 'idle' }
  if (!game.progress.completed) return { text: `In progress · possession ${game.progress.possessionIndex + 1} of ${game.rounds.length}`, tone: 'live' }
  const top = Math.max(...game.teams.map((t) => t.score))
  const winners = game.teams.filter((t) => t.score === top)
  return { text: winners.length === 1 ? `🏆 ${winners[0].name} won · ${top}` : `🤝 Tied at ${top}`, tone: 'done' }
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
  const seasonsEnabled = useFeatureFlag('seasons')
  const themesEnabled = useFeatureFlag('themes')
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [games, setGames] = useState<Game[]>([])
  const [tierLists, setTierLists] = useState<TierList[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [draftBoards, setDraftBoards] = useState<DraftBoard[]>([])
  const [popularityGames, setPopularityGames] = useState<PopularityGame[]>([])
  const [timelineGames, setTimelineGames] = useState<TimelineGame[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const importFileInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setGames(listGames())
    if (tierListsEnabled) setTierLists(listTierLists())
    if (tournamentsEnabled) setTournaments(listTournaments())
    if (draftEnabled) setDraftBoards(listDraftBoards())
    if (popularityEnabled) setPopularityGames(listPopularityGames())
    if (timelineEnabled) setTimelineGames(listTimelineGames())
    if (seasonsEnabled) setSeasons(listSeasons())
  }, [tierListsEnabled, tournamentsEnabled, draftEnabled, popularityEnabled, timelineEnabled, seasonsEnabled])

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

  function handleDeleteSeason(id: string) {
    const season = seasons.find((s) => s.id === id)
    if (!season) return
    deleteSeason(id)
    setSeasons((prev) => prev.filter((s) => s.id !== id))
    showToast(`"${season.name}" deleted`, {
      action: {
        label: 'Undo',
        onAction: () => {
          saveSeason(season)
          setSeasons(listSeasons())
        },
      },
    })
  }

  function handleDuplicateSeason(season: Season) {
    const copy = saveSeason(duplicateSeason(season))
    navigate(`/seasons/${copy.id}`)
  }

  // "Continue" shortcut — whatever's most recently touched across every section, by
  // `updatedAt` (every entity already bumps it on save, so this needs no separate
  // "last opened" tracking). Deliberately reads the raw lists, not the tag/search-filtered
  // ones below — this is a global "where were you" signal, not scoped to the current filter.
  const resumeItem = useMemo(() => {
    const candidates = [
      ...games.map((g) => ({ key: `game-${g.id}`, icon: '🎵', label: 'Game', name: g.name, to: `/games/${g.id}/edit`, updatedAt: g.updatedAt })),
      ...(tierListsEnabled
        ? tierLists.map((l) => ({ key: `tl-${l.id}`, icon: '🏆', label: 'Tier List', name: l.name, to: `/tierlists/${l.id}/edit`, updatedAt: l.updatedAt }))
        : []),
      ...(tournamentsEnabled
        ? tournaments.map((t) => ({ key: `t-${t.id}`, icon: '🏆', label: 'Tournament', name: t.name, to: `/tournaments/${t.id}`, updatedAt: t.updatedAt }))
        : []),
      ...(draftEnabled
        ? draftBoards.map((b) => ({ key: `d-${b.id}`, icon: '🎧', label: 'Draft', name: b.name, to: `/drafts/${b.id}`, updatedAt: b.updatedAt }))
        : []),
      ...(popularityEnabled
        ? popularityGames.map((g) => ({ key: `p-${g.id}`, icon: '📈', label: 'Popularity', name: g.name, to: `/popularity/${g.id}/present`, updatedAt: g.updatedAt }))
        : []),
      ...(timelineEnabled
        ? timelineGames.map((g) => ({ key: `tm-${g.id}`, icon: '🕰️', label: 'Timeline', name: g.name, to: `/timeline/${g.id}/present`, updatedAt: g.updatedAt }))
        : []),
      ...(seasonsEnabled
        ? seasons.map((s) => ({ key: `sn-${s.id}`, icon: '📅', label: 'Season', name: s.name, to: `/seasons/${s.id}`, updatedAt: s.updatedAt }))
        : []),
    ]
    if (candidates.length === 0) return null
    return candidates.reduce((best, c) => (c.updatedAt > best.updatedAt ? c : best))
  }, [
    games,
    tierLists,
    tierListsEnabled,
    tournaments,
    tournamentsEnabled,
    draftBoards,
    draftEnabled,
    popularityGames,
    popularityEnabled,
    timelineGames,
    timelineEnabled,
    seasons,
    seasonsEnabled,
  ])

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
  const searchTerm = searchQuery.trim().toLowerCase()
  const matchesSearch = (...fields: Array<string | undefined>) =>
    !searchTerm || fields.some((f) => f?.toLowerCase().includes(searchTerm))
  const hasAnyContent =
    games.length +
      tierLists.length +
      tournaments.length +
      draftBoards.length +
      popularityGames.length +
      timelineGames.length +
      seasons.length >
    0
  const recentFinished = modeVisibleGames.filter((g) => g.progress?.completed).slice(0, 3)
  const visibleGames = modeVisibleGames.filter((g) => matchesActiveTags(g.tags) && matchesSearch(g.name))
  const visibleTierLists = tierLists.filter((l) => matchesActiveTags(l.tags) && matchesSearch(l.name))
  const visibleTournaments = tournaments.filter((t) => matchesActiveTags(t.tags) && matchesSearch(t.name))
  const visibleDraftBoards = draftBoards.filter((b) => matchesActiveTags(b.tags) && matchesSearch(b.name))
  // Neither type carries tags (no tagging UI for them yet), so these two only ever narrow
  // by the search box, never the tag bar above.
  const visiblePopularityGames = popularityGames.filter((g) => matchesSearch(g.name, g.artistName))
  const visibleTimelineGames = timelineGames.filter((g) => matchesSearch(g.name))
  const visibleSeasons = seasons.filter((s) => matchesSearch(s.name, s.tag))

  function handleExportAll() {
    // Reads straight from storage rather than the tierLists/tournaments/draftBoards state
    // vars, so a backup taken while a flag is off still includes anything already saved under it.
    const allGames = exportAllGames()
    const allTierLists = exportAllTierLists()
    const allTournaments = exportAllTournaments()
    const allDraftBoards = exportAllDraftBoards()
    const allPopularityGames = exportAllPopularityGames()
    const allTimelineGames = exportAllTimelineGames()
    const allSeasons = exportAllSeasons()
    const contents = {
      games: allGames,
      tierLists: allTierLists,
      tournaments: allTournaments,
      draftBoards: allDraftBoards,
      popularityGames: allPopularityGames,
      timelineGames: allTimelineGames,
      seasons: allSeasons,
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
      importSeasons(imported.seasons)
      setGames(listGames())
      if (tierListsEnabled) setTierLists(listTierLists())
      if (tournamentsEnabled) setTournaments(listTournaments())
      if (draftEnabled) setDraftBoards(listDraftBoards())
      if (popularityEnabled) setPopularityGames(listPopularityGames())
      if (timelineEnabled) setTimelineGames(listTimelineGames())
      if (seasonsEnabled) setSeasons(listSeasons())
      setBackupStatus(`Restored ${parts.join(', ')} from backup.`)
    } catch (err) {
      setBackupStatus(err instanceof BackupFileError ? err.message : 'Could not read that file.')
    }
  }

  return (
    <div className="relative min-h-svh court-lines">
      <div className="mx-auto max-w-5xl px-6 py-16">
        {themesEnabled && (
          <button
            onClick={() => setThemePickerOpen(true)}
            className="absolute right-4 top-4 rounded-full border border-arena-600 bg-black/30 px-3 py-1.5 text-sm text-slate-300 hover:border-hardwood-500"
          >
            🎨 Theme
          </button>
        )}
        {themePickerOpen && <ThemePicker onClose={() => setThemePickerOpen(false)} />}
        <div className="text-center">
          <div className="mb-3 text-5xl">🏀</div>
          <h1 className="font-display text-6xl tracking-wide text-white">BUZZER BEATS</h1>
          <p className="mt-2 text-slate-400">A basketball-themed party trivia game — songs, lyrics, years, and rankings.</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink to="/new" variant="primary" size="lg" className="px-10 shadow-lg shadow-hardwood-500/20">
              + CREATE GAME
            </ButtonLink>
            {tierListsEnabled && (
              <ButtonLink to="/tierlists/new" size="lg" className="px-10">
                + CREATE TIER LIST
              </ButtonLink>
            )}
            {tournamentsEnabled && (
              <ButtonLink to="/tournaments/new" size="lg" className="px-10">
                + CREATE TOURNAMENT
              </ButtonLink>
            )}
            {draftEnabled && (
              <ButtonLink to="/drafts/new" size="lg" className="px-10">
                + CREATE DRAFT
              </ButtonLink>
            )}
            {popularityEnabled && (
              <ButtonLink to="/popularity/new" size="lg" className="px-10">
                + GUESS THE POPULARITY
              </ButtonLink>
            )}
            {timelineEnabled && (
              <ButtonLink to="/timeline/new" size="lg" className="px-10">
                + GUESS THE TIMELINE
              </ButtonLink>
            )}
            {seasonsEnabled && (
              <ButtonLink to="/seasons/new" size="lg" className="px-10">
                + CREATE SEASON
              </ButtonLink>
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

        {resumeItem && (
          <div className="mx-auto mt-12 max-w-md">
            <Link
              to={resumeItem.to}
              className="flex items-center gap-3 rounded-xl border border-hardwood-500/40 bg-hardwood-500/10 px-4 py-3 hover:border-hardwood-500"
            >
              <span className="text-2xl">{resumeItem.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-widest text-hardwood-400">Continue where you left off</div>
                <div className="truncate font-semibold text-slate-100">{resumeItem.name}</div>
              </div>
              <span className="shrink-0 text-sm text-hardwood-400">{resumeItem.label} →</span>
            </Link>
          </div>
        )}

        {hasAnyContent && (
          <div className="mx-auto mt-12 max-w-md">
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search everything by name…"
                className="w-full rounded-full border border-arena-600 bg-arena-800 py-2.5 pl-10 pr-9 text-sm text-slate-100 outline-none focus:border-hardwood-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {recentFinished.length > 0 && searchQuery.trim() === '' && (
          <div className="mx-auto mt-10 max-w-3xl">
            <div className="mb-2 text-xs uppercase tracking-widest text-slate-500">Recently finished</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {recentFinished.map((game) => (
                <Link
                  key={game.id}
                  to={`/games/${game.id}/present`}
                  className="rounded-xl border border-arena-600 bg-arena-800/60 px-3 py-2 hover:border-hardwood-500"
                >
                  <div className="truncate text-sm font-semibold text-slate-100">{game.name}</div>
                  <div className="truncate text-xs text-scoreboard-green">{gameStatus(game).text}</div>
                  <div className="text-[11px] text-slate-500">{timeAgo(game.updatedAt)}</div>
                </Link>
              ))}
            </div>
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
          <HomeSection id="games" title="YOUR GAMES" count={modeVisibleGames.length} forceOpen={searchQuery.trim() !== ''}>
            {visibleGames.length === 0 ? (
              <EmptyState icon="🔎">No games match your search or filters.</EmptyState>
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
                    <div
                      className={`mt-0.5 text-xs ${
                        gameStatus(game).tone === 'live' ? 'text-hardwood-400' : gameStatus(game).tone === 'done' ? 'text-scoreboard-green' : 'text-slate-500'
                      }`}
                    >
                      {gameStatus(game).text} · {timeAgo(game.updatedAt)}
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
          </HomeSection>
        )}

        {tierListsEnabled && tierLists.length > 0 && (
          <HomeSection id="tierlists" title="YOUR TIER LISTS" count={tierLists.length} forceOpen={searchQuery.trim() !== ''}>
            {visibleTierLists.length === 0 ? (
              <EmptyState icon="🔎">No tier lists match your search or filters.</EmptyState>
            ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {visibleTierLists.map((list) => {
                const ranked = list.songs.filter((s) => s.tierId !== null).length
                return (
                  <Panel key={list.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">🏆</span>
                        <div className="font-semibold text-slate-100">{list.name}</div>
                      </div>
                      <div className="text-sm text-slate-500">
                        {list.songs.length} song{list.songs.length === 1 ? '' : 's'} · {list.tiers.length} tiers ·{' '}
                        {list.songs.length === 0
                          ? 'no songs yet'
                          : ranked === list.songs.length
                            ? '✓ fully ranked'
                            : `${ranked} of ${list.songs.length} ranked`}{' '}
                        · {timeAgo(list.updatedAt)}
                      </div>
                      {list.songs.length > 0 && (
                        <div className="mt-1.5 flex h-1.5 max-w-56 overflow-hidden rounded-full bg-arena-700" aria-hidden>
                          {list.tiers.map((tier) => {
                            const n = list.songs.filter((s) => s.tierId === tier.id).length
                            return n > 0 ? <span key={tier.id} style={{ width: `${(n / list.songs.length) * 100}%`, background: tier.color }} /> : null
                          })}
                        </div>
                      )}
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
                        {ranked === 0 ? 'Present' : ranked === list.songs.length ? 'View' : 'Continue'}
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
          </HomeSection>
        )}

        {tournamentsEnabled && tournaments.length > 0 && (
          <HomeSection id="tournaments" title="YOUR TOURNAMENTS" count={tournaments.length} forceOpen={searchQuery.trim() !== ''}>
            {visibleTournaments.length === 0 ? (
              <EmptyState icon="🔎">No tournaments match your search or filters.</EmptyState>
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
          </HomeSection>
        )}

        {seasonsEnabled && seasons.length > 0 && (
          <HomeSection id="seasons" title="YOUR SEASONS" count={seasons.length} forceOpen={searchQuery.trim() !== ''}>
            {visibleSeasons.length === 0 ? (
              <EmptyState icon="🔎">No seasons match your search.</EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {visibleSeasons.map((season) => (
                  <Panel key={season.id} className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">📅</span>
                        <div className="font-semibold text-slate-100">{season.name}</div>
                      </div>
                      <div className="text-sm text-slate-500">
                        Tag: <span className="rounded-full bg-arena-700 px-1.5 py-0.5 text-[10px] text-slate-400">{season.tag}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        to={`/seasons/${season.id}`}
                        className="rounded-lg bg-hardwood-500 px-3 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400"
                      >
                        Open
                      </Link>
                      <button
                        onClick={() => handleDuplicateSeason(season)}
                        className="rounded-lg px-2 text-slate-500 hover:text-slate-200"
                        aria-label={`Duplicate ${season.name}`}
                        title="Duplicate"
                      >
                        ⧉
                      </button>
                      <button
                        onClick={() => handleDeleteSeason(season.id)}
                        className="rounded-lg px-2 text-slate-500 hover:text-scoreboard-500"
                        aria-label="Delete season"
                      >
                        ✕
                      </button>
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </HomeSection>
        )}

        {draftEnabled && draftBoards.length > 0 && (
          <HomeSection id="drafts" title="YOUR DRAFTS" count={draftBoards.length} forceOpen={searchQuery.trim() !== ''}>
            {visibleDraftBoards.length === 0 ? (
              <EmptyState icon="🔎">No drafts match your search or filters.</EmptyState>
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
                        {(() => {
                          const sum = summarizeDraftBoard(board)
                          return sum.sessions > 0 ? (
                            <div className="text-xs text-slate-500">
                              {sum.inProgress > 0 ? <span className="text-hardwood-400">{sum.inProgress} in progress · </span> : null}
                              {sum.completed} finished{sum.lastPlayed ? ` · last played ${timeAgo(sum.lastPlayed)}` : ''}
                            </div>
                          ) : null
                        })()}
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
          </HomeSection>
        )}

        {popularityEnabled && popularityGames.length > 0 && (
          <HomeSection id="popularity" title="YOUR POPULARITY GAMES" count={popularityGames.length} forceOpen={searchQuery.trim() !== ''}>
            {visiblePopularityGames.length === 0 ? (
              <EmptyState icon="🔎">No popularity games match your search.</EmptyState>
            ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {visiblePopularityGames.map((game) => {
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
            )}
          </HomeSection>
        )}

        {timelineEnabled && timelineGames.length > 0 && (
          <HomeSection id="timeline" title="YOUR TIMELINE GAMES" count={timelineGames.length} forceOpen={searchQuery.trim() !== ''}>
            {visibleTimelineGames.length === 0 ? (
              <EmptyState icon="🔎">No timeline games match your search.</EmptyState>
            ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {visibleTimelineGames.map((game) => {
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
            )}
          </HomeSection>
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
