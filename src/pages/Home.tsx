import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { rulesFor } from '../lib/mode-rules'
import ButtonLink from '../components/ui/ButtonLink'
import { summarizeDraftBoard } from '../lib/draft-summary'
import HomeSection, { HOME_JUMP_EVENT } from '../components/HomeSection'
import { listSavedBlindGames } from '../lib/slot-ranking'
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
import { buildBackupFile, downloadBackupFile, parseBackupFile, BackupFileError, type BackupContents } from '../lib/game-backup'
import {
  CloudBackupError,
  downloadCloudBackup,
  formatBackupCode,
  isCloudBackupAvailable,
  loadSavedCloudBackup,
  normalizeBackupCode,
  uploadCloudBackup,
} from '../lib/cloud-backup'
import { duplicateGame, usesTierList, type Game } from '../types'
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
import { Icon } from '../components/Icon'
import { withIcons } from '../lib/with-icons'
import HeroBall from '../components/HeroBall'
import ActionMenu from '../components/ActionMenu'

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
  const [cloud, setCloud] = useState(loadSavedCloudBackup)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [showCloudCode, setShowCloudCode] = useState(false)
  const [cloudCodeInput, setCloudCodeInput] = useState('')
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
      ...(tierListsEnabled
        ? listSavedBlindGames().flatMap((b) => {
            const l = tierLists.find((x) => x.id === b.listId)
            return l ? [{ key: `bg-${l.id}`, icon: '🙈', label: 'Blind Ranking', name: `${l.name} — game in progress`, to: `/tierlists/${l.id}/rank-together`, updatedAt: b.savedAt }] : []
          })
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
  const modeVisibleGames = tierListsEnabled ? games : games.filter((g) => !usesTierList(g))

  // The sections shown below, for the jump bar — only the ones that actually have something in them.
  const jumpSections = [
    { id: 'games', label: 'Games', count: modeVisibleGames.length, on: true },
    { id: 'tierlists', label: 'Tier lists', count: tierLists.length, on: tierListsEnabled },
    { id: 'tournaments', label: 'Tournaments', count: tournaments.length, on: tournamentsEnabled },
    { id: 'seasons', label: 'Seasons', count: seasons.length, on: seasonsEnabled },
    { id: 'drafts', label: 'Drafts', count: draftBoards.length, on: draftEnabled },
    { id: 'popularity', label: 'Popularity', count: popularityGames.length, on: popularityEnabled },
    { id: 'timeline', label: 'Timeline', count: timelineGames.length, on: timelineEnabled },
  ].filter((sec) => sec.on && sec.count > 0)


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

  // Reads straight from storage rather than the tierLists/tournaments/draftBoards state vars, so a
  // backup taken while a flag is off still includes anything already saved under it.
  function collectBackupContents(): BackupContents {
    return {
      games: exportAllGames(),
      tierLists: exportAllTierLists(),
      tournaments: exportAllTournaments(),
      draftBoards: exportAllDraftBoards(),
      popularityGames: exportAllPopularityGames(),
      timelineGames: exportAllTimelineGames(),
      seasons: exportAllSeasons(),
    }
  }

  function handleExportAll() {
    const contents = collectBackupContents()
    if (Object.values(contents).every((list) => list.length === 0)) {
      setBackupStatus('Nothing to back up yet.')
      return
    }
    downloadBackupFile(contents)
    const parts = describeBackupContents(contents)
    setBackupStatus(`Downloaded a backup of ${parts.join(', ')}.`)
  }

  async function handleCloudBackup() {
    const contents = collectBackupContents()
    if (Object.values(contents).every((list) => list.length === 0)) {
      setBackupStatus('Nothing to back up yet.')
      return
    }
    setCloudBusy(true)
    try {
      const saved = await uploadCloudBackup(buildBackupFile(contents))
      setCloud(saved)
      setShowCloudCode(true)
      setBackupStatus(`Backed up ${describeBackupContents(contents).join(', ')} to the cloud.`)
    } catch (err) {
      setBackupStatus(err instanceof CloudBackupError ? err.message : 'Cloud backup failed.')
    } finally {
      setCloudBusy(false)
    }
  }

  async function handleCloudRestore() {
    const code = normalizeBackupCode(cloudCodeInput)
    setCloudBusy(true)
    try {
      const { backup } = await downloadCloudBackup(code)
      await restoreFromText(backup)
      setCloud(loadSavedCloudBackup())
      setCloudCodeInput('')
    } catch (err) {
      setBackupStatus(err instanceof CloudBackupError ? err.message : 'Could not restore that backup.')
    } finally {
      setCloudBusy(false)
    }
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await restoreFromText(await file.text())
    } catch (err) {
      setBackupStatus(err instanceof BackupFileError ? err.message : 'Could not read that file.')
    }
  }

  // Confirms, then writes a backup's contents into storage and refreshes what's on screen. Shared by
  // "Restore from backup" (a file) and "Restore from cloud".
  async function restoreFromText(text: string) {
    try {
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
      setBackupStatus(err instanceof BackupFileError ? err.message : 'Could not read that backup.')
    }
  }

  return (
    <div className="relative min-h-svh overflow-x-clip court-lines">
      <div className="home-sections mx-auto max-w-6xl px-6 py-12">
        {themesEnabled && (
          <button
            onClick={() => setThemePickerOpen(true)}
            className="absolute right-4 top-4 rounded-full border border-arena-600 bg-black/30 px-3 py-1.5 text-sm text-slate-300 hover:border-hardwood-500"
          >
            <Icon name="palette" /> Theme
          </button>
        )}
        {themePickerOpen && <ThemePicker onClose={() => setThemePickerOpen(false)} />}
        <header className="relative pb-4 pt-6 sm:pt-10">
          <HeroBall className="pointer-events-auto absolute -right-24 -top-10 z-0 w-[14rem] rotate-[14deg] opacity-90 sm:-right-24 sm:-top-14 sm:w-[24rem] lg:-right-16 lg:-top-20 lg:w-[30rem]" />
          <div className="relative z-10 max-w-3xl">
            <h1 className="font-display text-[5.6rem] leading-[0.82] tracking-tight text-white [text-shadow:4px_4px_0_rgb(0_0_0/0.45)] sm:text-[9rem]">
              <span className="block">BUZZER</span>{' '}
              <span className="ml-8 inline-block -rotate-2 bg-hardwood-500 px-3 pb-1 pt-2 text-arena-950 [text-shadow:none] shadow-[5px_5px_0_0_rgb(0_0_0/0.5)] sm:ml-24">BEATS</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-snug text-slate-300">A basketball-themed party trivia game — songs, lyrics, years, and rankings.</p>
          </div>
          <div className="relative z-10 mt-8 flex flex-wrap items-center gap-x-3 gap-y-4 [&>:nth-child(even)]:rotate-[0.8deg] [&>:nth-child(odd)]:-rotate-[0.6deg]">
            <ButtonLink to="/new" variant="primary" size="lg" className="px-8">
              + CREATE GAME
            </ButtonLink>
            <ButtonLink to="/quick" size="lg" className="px-8">
              <Icon name="bolt" /> QUICK GAME
            </ButtonLink>
            <ActionMenu
              label={<><Icon name="plus" /> TIERS, DRAFTS &amp; MORE</>}
              align="left"
              triggerClassName="px-8 py-3 text-lg"
              items={[
                { key: 'tier', label: 'Tier list', to: '/tierlists/new', hidden: !tierListsEnabled, title: 'Rank songs into tiers' },
                { key: 'tourn', label: 'Tournament', to: '/tournaments/new', hidden: !tournamentsEnabled, title: 'Chain games into a bracket-style series' },
                { key: 'season', label: 'Season', to: '/seasons/new', hidden: !seasonsEnabled, title: 'Standings across every game with a tag' },
                { key: 'draft', label: 'Draft board', to: '/drafts/new', hidden: !draftEnabled, title: 'Take turns drafting songs' },
                { key: 'pop', label: 'Guess the popularity', to: '/popularity/new', hidden: !popularityEnabled, title: 'Rank an artist\'s songs by popularity' },
                { key: 'time', label: 'Guess the timeline', to: '/timeline/new', hidden: !timelineEnabled, title: 'Place songs on a timeline' },
              ]}
            />
          </div>
        </header>

        {games.length === 0 && (
          <div className="mx-auto mt-12 max-w-lg space-y-4">
            <p className="text-center text-sm text-slate-500">
              Games are built from tracks pulled in from a music source below — connect one before creating a game.
            </p>
            <SoundCloudConnectPanel />
            {spotifyImportEnabled && <SpotifyConnectPanel />}
          </div>
        )}

        <div className="mt-12 grid gap-6 md:grid-cols-2 md:items-end">
        {resumeItem && (
          <div className="max-w-md">
            <Link
              to={resumeItem.to}
              className="flex items-center gap-3 rounded-xl border border-hardwood-500/40 bg-hardwood-500/10 px-4 py-3 hover:border-hardwood-500"
            >
              <span className="text-2xl">{withIcons(resumeItem.icon)}</span>
              <div className="min-w-0 flex-1">
                <div className="marker -rotate-1 text-base text-pop-400">Continue where you left off</div>
                <div className="truncate font-semibold text-slate-100">{resumeItem.name}</div>
              </div>
              <span className="shrink-0 text-sm text-hardwood-400">{resumeItem.label} →</span>
            </Link>
          </div>
        )}

        {hasAnyContent && (
          <div className="w-full max-w-sm md:col-start-2 md:justify-self-end">
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"><Icon name="search" /></span>
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
                  <Icon name="x" />
                </button>
              )}
            </div>
          </div>
        )}
        </div>

        {recentFinished.length > 0 && searchQuery.trim() === '' && (
          <div className="mt-10">
            <div className="marker mb-2 -rotate-1 text-base text-slate-400">Recently finished</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {recentFinished.map((game) => (
                <Link
                  key={game.id}
                  to={`/games/${game.id}/present`}
                  className="rounded-xl border-2 border-arena-600 bg-arena-800/70 px-3 py-2 shadow-lg transition-transform odd:-rotate-1 even:rotate-1 hover:rotate-0 hover:border-hardwood-500"
                >
                  <div className="truncate text-sm font-semibold text-slate-100">{game.name}</div>
                  <div className="truncate text-xs text-scoreboard-green">{withIcons(gameStatus(game).text)}</div>
                  <div className="text-xs text-slate-500">{timeAgo(game.updatedAt)}</div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {allTags.length > 0 && (
          <div className="mt-10 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-slate-500">Tags</span>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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

        {jumpSections.length >= 3 && searchQuery.trim() === '' && (
          <nav aria-label="Jump to a section" className="mt-8 flex flex-wrap items-center gap-2">
            {jumpSections.map((sec) => (
              <button
                key={sec.id}
                onClick={() => window.dispatchEvent(new CustomEvent(HOME_JUMP_EVENT, { detail: sec.id }))}
                className="rounded-full border border-arena-600 px-3 py-1 text-xs font-medium text-slate-300 odd:-rotate-1 even:rotate-1 hover:rotate-0 hover:border-hardwood-500 hover:text-white"
              >
                {sec.label} <span className="text-slate-500">{sec.count}</span>
              </button>
            ))}
          </nav>
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
                <Panel key={game.id} padding="md" className="flex items-start gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-arena-700">
                    {thumbnailUrl ? (
                      <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl text-arena-500">
                        {withIcons(rulesFor(game.mode).icon)}
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
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
                      {withIcons(gameStatus(game).text)} · {timeAgo(game.updatedAt)}
                    </div>
                    {game.tags && game.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {game.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-arena-700 px-1.5 py-0.5 text-xs text-slate-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {(game.history?.length ?? 0) > 0 && game.progress?.completed && (
                      <Link to={`/games/${game.id}/replay`} className="rounded-full border border-arena-500 px-4 py-1.5 text-sm text-slate-200 hover:border-hardwood-500">
                        Replay
                      </Link>
                    )}
                    <Link to={`/games/${game.id}/edit`} className="rounded-full border border-arena-500 px-4 py-1.5 text-sm text-slate-200 hover:border-hardwood-500">
                      Edit
                    </Link>
                    <Link to={`/games/${game.id}/present`} className="rounded-full bg-hardwood-500 px-4 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400">
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
                      <Icon name="x" />
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
          <HomeSection id="tierlists" inset="left" title="YOUR TIER LISTS" count={tierLists.length} forceOpen={searchQuery.trim() !== ''}>
            {visibleTierLists.length === 0 ? (
              <EmptyState icon="🔎">No tier lists match your search or filters.</EmptyState>
            ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {visibleTierLists.map((list) => {
                const ranked = list.songs.filter((s) => s.tierId !== null).length
                return (
                  <Panel key={list.id} className="@container"><div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1.5">
                        <span className="mt-[0.3em] text-xs"><Icon name="trophy" /></span>
                        <div className="font-semibold text-slate-100">{list.name}</div>
                      </div>
                      <div className="text-sm text-slate-500">
                        {list.songs.length} song{list.songs.length === 1 ? '' : 's'} · {list.tiers.length} tiers ·{' '}
                        {list.songs.length === 0
                          ? 'no songs yet'
                          : ranked === list.songs.length
                            ? withIcons('✓ fully ranked')
                            : `${ranked} of ${list.songs.length} ranked`}{' '}
                        · {timeAgo(list.updatedAt)}
                      </div>
                      {list.songs.length > 0 && (
                        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-arena-700" aria-hidden>
                          {list.tiers.map((tier) => {
                            const n = list.songs.filter((s) => s.tierId === tier.id).length
                            return n > 0 ? <span key={tier.id} style={{ width: `${(n / list.songs.length) * 100}%`, background: tier.color }} /> : null
                          })}
                        </div>
                      )}
                      {list.tags && list.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {list.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-arena-700 px-1.5 py-0.5 text-xs text-slate-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 self-end @xl:self-auto">
                      <Link
                        to={`/tierlists/${list.id}/edit`}
                        className="rounded-full border border-arena-500 px-4 py-1.5 text-sm text-slate-200 hover:border-hardwood-500"
                      >
                        Edit
                      </Link>
                      <Link
                        to={`/tierlists/${list.id}/present`}
                        className="rounded-full bg-hardwood-500 px-4 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400"
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
                        <Icon name="x" />
                      </button>
                    </div>
                  </div></Panel>
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
                  <Panel key={tournament.id} className="@container"><div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1.5">
                        <span className="mt-[0.3em] text-xs"><Icon name="trophy" /></span>
                        <div className="font-semibold text-slate-100">{tournament.name}</div>
                      </div>
                      <div className="text-sm text-slate-500">
                        {tournament.gameIds.length} game{tournament.gameIds.length === 1 ? '' : 's'}
                      </div>
                      {tournament.tags && tournament.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {tournament.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-arena-700 px-1.5 py-0.5 text-xs text-slate-400">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 self-end @xl:self-auto">
                      <Link
                        to={`/tournaments/${tournament.id}`}
                        className="rounded-full bg-hardwood-500 px-4 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400"
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
                        <Icon name="x" />
                      </button>
                    </div>
                  </div></Panel>
                ))}
              </div>
            )}
          </HomeSection>
        )}

        {seasonsEnabled && seasons.length > 0 && (
          <HomeSection id="seasons" inset="left" title="YOUR SEASONS" count={seasons.length} forceOpen={searchQuery.trim() !== ''}>
            {visibleSeasons.length === 0 ? (
              <EmptyState icon="🔎">No seasons match your search.</EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {visibleSeasons.map((season) => (
                  <Panel key={season.id} className="@container"><div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1.5">
                        <span className="mt-[0.3em] text-xs"><Icon name="calendar" /></span>
                        <div className="font-semibold text-slate-100">{season.name}</div>
                      </div>
                      <div className="text-sm text-slate-500">
                        Tag: <span className="rounded-full bg-arena-700 px-1.5 py-0.5 text-xs text-slate-400">{season.tag}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 self-end @xl:self-auto">
                      <Link
                        to={`/seasons/${season.id}`}
                        className="rounded-full bg-hardwood-500 px-4 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400"
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
                        <Icon name="x" />
                      </button>
                    </div>
                  </div></Panel>
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
                    <Panel key={board.id} className="@container"><div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-1.5">
                          <span className="mt-[0.3em] text-xs"><Icon name="headphones" /></span>
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
                              <span key={tag} className="rounded-full bg-arena-700 px-1.5 py-0.5 text-xs text-slate-400">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 self-end @xl:self-auto">
                        <Link
                          to={`/drafts/${board.id}`}
                          className="rounded-full bg-hardwood-500 px-4 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400"
                        >
                          Open
                        </Link>
                        <button
                          onClick={() => handleDeleteDraftBoard(board.id)}
                          className="rounded-lg px-2 text-slate-500 hover:text-scoreboard-500"
                          aria-label="Delete draft"
                        >
                          <Icon name="x" />
                        </button>
                      </div>
                    </div></Panel>
                  )
                })}
              </div>
            )}
          </HomeSection>
        )}

        {popularityEnabled && popularityGames.length > 0 && (
          <HomeSection id="popularity" inset="left" title="YOUR POPULARITY GAMES" count={popularityGames.length} forceOpen={searchQuery.trim() !== ''}>
            {visiblePopularityGames.length === 0 ? (
              <EmptyState icon="🔎">No popularity games match your search.</EmptyState>
            ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {visiblePopularityGames.map((game) => {
                const solvedCount = Object.keys(game.progress.solved).length
                return (
                  <Panel key={game.id} className="@container"><div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1.5">
                        <span className="mt-[0.3em] text-xs"><Icon name="trend" /></span>
                        <div className="font-semibold text-slate-100">{game.name}</div>
                      </div>
                      <div className="text-sm text-slate-500">
                        {game.artistName} · {solvedCount}/{game.ranks.length} ranks solved
                      </div>
                    </div>
                    <div className="flex gap-2 self-end @xl:self-auto">
                      <Link
                        to={`/popularity/${game.id}/present`}
                        className="rounded-full bg-hardwood-500 px-4 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400"
                      >
                        {game.progress.completed ? 'View' : solvedCount > 0 ? 'Continue' : 'Play'}
                      </Link>
                      <button
                        onClick={() => handleDeletePopularityGame(game.id)}
                        className="rounded-lg px-2 text-slate-500 hover:text-scoreboard-500"
                        aria-label="Delete game"
                      >
                        <Icon name="x" />
                      </button>
                    </div>
                  </div></Panel>
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
                  <Panel key={game.id} className="@container"><div className="flex flex-col gap-3 @xl:flex-row @xl:items-center @xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1.5">
                        <span className="mt-[0.3em] text-xs"><Icon name="clock" /></span>
                        <div className="font-semibold text-slate-100">{game.name}</div>
                      </div>
                      <div className="text-sm text-slate-500">
                        {game.songs.length} songs · {placedCount} placed
                      </div>
                    </div>
                    <div className="flex gap-2 self-end @xl:self-auto">
                      <Link
                        to={`/timeline/${game.id}/present`}
                        className="rounded-full bg-hardwood-500 px-4 py-1.5 text-sm font-medium text-arena-950 hover:bg-hardwood-400"
                      >
                        {game.progress.completed ? 'View' : game.progress.deckIndex > 1 ? 'Continue' : 'Play'}
                      </Link>
                      <button
                        onClick={() => handleDeleteTimelineGame(game.id)}
                        className="rounded-lg px-2 text-slate-500 hover:text-scoreboard-500"
                        aria-label="Delete game"
                      >
                        <Icon name="x" />
                      </button>
                    </div>
                  </div></Panel>
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
          {isCloudBackupAvailable() && (
            <div className="mx-auto mt-4 max-w-md rounded-xl border border-arena-700 bg-arena-900/40 p-4 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-200"><Icon name="cloud" /> Cloud backup</div>
                  <div className="text-xs text-slate-500">
                    {cloud ? `Last backed up ${timeAgo(cloud.at)}.` : 'Keep a copy online and restore it on any device with a code.'}
                  </div>
                </div>
                <button
                  onClick={handleCloudBackup}
                  disabled={cloudBusy}
                  className="rounded-full border border-hardwood-500 px-4 py-1.5 text-sm font-semibold text-hardwood-400 hover:bg-hardwood-500/10 disabled:opacity-50"
                >
                  {cloudBusy ? 'Working…' : cloud ? 'Back up again' : 'Back up now'}
                </button>
              </div>
              {cloud && (
                <div className="mt-3">
                  <button onClick={() => setShowCloudCode((v) => !v)} className="text-xs text-slate-400 underline hover:text-slate-200">
                    {showCloudCode ? 'Hide my restore code' : 'Show my restore code'}
                  </button>
                  {showCloudCode && (
                    <div className="mt-2 rounded-lg bg-black/30 px-3 py-2">
                      <div className="font-mono text-sm tracking-wider text-white">{formatBackupCode(cloud.code)}</div>
                      <p className="mt-1 text-xs text-slate-500">
                        Write this down — anyone with it can read and replace your backup, and it's the only way to restore on another device.
                        Backups untouched for 90 days are deleted.
                      </p>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <input
                  value={cloudCodeInput}
                  onChange={(e) => setCloudCodeInput(e.target.value)}
                  placeholder="Restore code"
                  aria-label="Cloud backup restore code"
                  className="min-w-0 flex-1 rounded-lg border border-arena-600 bg-arena-800 px-3 py-1.5 font-mono text-sm text-slate-100 outline-none focus:border-hardwood-500"
                />
                <button
                  onClick={handleCloudRestore}
                  disabled={cloudBusy || normalizeBackupCode(cloudCodeInput).length < 16}
                  className="rounded-full border border-arena-500 px-4 py-1.5 text-sm text-slate-200 hover:border-hardwood-500 disabled:opacity-40"
                >
                  Restore
                </button>
              </div>
            </div>
          )}
          {backupStatus && <p className="mt-2 text-xs text-slate-400">{backupStatus}</p>}
        </div>

        <div className="mt-8 flex flex-col items-center gap-2">
          <SoundCloudAttribution />
          <div className="flex items-center gap-3">
            <Link to="/stats" className="text-xs text-slate-600 hover:text-slate-400">
              Stats
            </Link>
            <Link to="/settings" className="text-xs text-slate-600 hover:text-slate-400">
              Settings
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
