import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DEFAULT_POWER_UPS_PER_TEAM, POWER_UP_KINDS, type Game, type PowerUpKind, type SongRound } from '../types'
import {
  createEmptyLyricRound,
  createEmptyRound,
  createTeam,
  createTierGuessRound,
  isLyricMode,
  isTierGuessMode,
  isYearMode,
  teamColorForIndex,
  TEAM_COLORS,
  TEAM_AVATARS,
  DEFAULT_ANSWER_TIMER_SECONDS,
} from '../types'
import type { TierList, TierListSong } from '../types/tierlist'
import { getGame, listGames, saveGame } from '../lib/storage/game-repository'
import { getTierList, listTierLists } from '../lib/storage/tierlist-repository'
import { buildShareUrl } from '../lib/game-share'
import ImportSoundCloudModal from '../components/ImportSoundCloudModal'
import ImportSpotifyModal from '../components/ImportSpotifyModal'
import ClipEditor from '../components/ClipEditor'
import LyricEditor from '../components/LyricEditor'
import TierListPickerModal from '../components/TierListPickerModal'
import ImportFromTierListModal from '../components/ImportFromTierListModal'
import AnswerKeyModal from '../components/AnswerKeyModal'
import TagInput from '../components/TagInput'
import type { ImportableTrack } from '../lib/soundcloud/soundcloud-tracks'
import type { ImportableSpotifyTrack } from '../lib/spotify/spotify-tracks'
import { isSpotifyConfigured } from '../lib/spotify/config'
import { useFeatureFlag } from '../state/feature-flags-context'
import Panel from '../components/ui/Panel'
import EmptyState from '../components/ui/EmptyState'
import BuilderSection from '../components/BuilderSection'
import ModeRulesCard from '../components/ModeRulesCard'
import Button from '../components/ui/Button'
import { useToast } from '../state/toast-context'

const MIN_TEAMS = 2
const MAX_TEAMS = 8

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function parseTimeToSeconds(input: string): number {
  const trimmed = input.trim()
  const match = trimmed.match(/^(\d+):(\d{1,2})$/)
  if (match) return Math.max(0, parseInt(match[1], 10) * 60 + parseInt(match[2], 10))
  const seconds = Number(trimmed)
  return Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0
}

export default function GameBuilder() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const showToast = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [spotifyImportOpen, setSpotifyImportOpen] = useState(false)
  const spotifyImportEnabled = useFeatureFlag('spotify-import') && isSpotifyConfigured()
  const [bulkStartInput, setBulkStartInput] = useState('0:00')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [answerKeyOpen, setAnswerKeyOpen] = useState(false)
  const [tierListPickerOpen, setTierListPickerOpen] = useState(false)
  const [tierGuessImportOpen, setTierGuessImportOpen] = useState(false)
  const [pickedTierList, setPickedTierList] = useState<TierList | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [colorPickerTeamId, setColorPickerTeamId] = useState<string | null>(null)
  const [avatarPickerTeamId, setAvatarPickerTeamId] = useState<string | null>(null)
  // Computed once at mount, not kept live — it only feeds the tag autocomplete, so it's fine
  // if a tag added to another game mid-session doesn't show up here until next visit.
  const tagSuggestions = useMemo(() => Array.from(new Set(listGames().flatMap((g) => g.tags ?? []))).sort(), [])
  const localFileInput = useRef<HTMLInputElement | null>(null)
  const tierListsEnabled = useFeatureFlag('tier-lists')
  const powerUpsEnabled = useFeatureFlag('power-ups')
  const suddenDeathEnabled = useFeatureFlag('sudden-death')

  useEffect(() => {
    if (!gameId) return
    const loaded = getGame(gameId)
    // Tier Guess rides on the tier-lists flag — if it's off (including for someone who
    // received a shared link to a game built while it was on), treat the game as
    // inaccessible here rather than half-rendering a mode-specific editor for a feature
    // that's not switched on.
    if (loaded && isTierGuessMode(loaded) && !tierListsEnabled) {
      navigate('/', { replace: true })
      return
    }
    setGame(loaded)
    setSelectedRoundId(loaded?.rounds[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, tierListsEnabled])

  // When this editing session last saved (every change is written straight to this browser).
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const selectedRound = useMemo(() => game?.rounds.find((r) => r.id === selectedRoundId) ?? null, [game, selectedRoundId])

  function persist(next: Game) {
    const saved = saveGame(next)
    setGame(saved)
    setSavedAt(Date.now())
  }

  function updateRound(updated: SongRound) {
    if (!game) return
    persist({ ...game, rounds: game.rounds.map((r) => (r.id === updated.id ? updated : r)) })
  }

  // Delete-then-offer-Undo instead of a confirm dialog — see the same pattern (and the
  // reasoning for it) in Home.tsx's library deletes. Undo re-inserts the captured round at
  // its original index and persists off whatever the game looks like *then* (a functional
  // update, not the `game` this closure captured at delete time), so it can't clobber any
  // other edit made in between.
  function removeRound(id: string) {
    if (!game) return
    const index = game.rounds.findIndex((r) => r.id === id)
    if (index === -1) return
    const round = game.rounds[index]
    const label = round.title.trim() || (round.source === 'lyric' ? 'this lyric round' : 'this round')
    const rounds = game.rounds.filter((r) => r.id !== id)
    persist({ ...game, rounds })
    if (selectedRoundId === id) setSelectedRoundId(rounds[0]?.id ?? null)
    showToast(`"${label}" removed`, {
      action: {
        label: 'Undo',
        onAction: () => {
          setGame((prev) => {
            if (!prev) return prev
            const restored = [...prev.rounds]
            restored.splice(Math.min(index, restored.length), 0, round)
            return saveGame({ ...prev, rounds: restored })
          })
        },
      },
    })
  }

  // Reserve rounds (flag: sudden-death) live outside `rounds` entirely, so they never show up in
  // normal play — the presenter only pulls one in if the game ends tied.
  function reserveRound(round: SongRound) {
    if (!game) return
    const rounds = game.rounds.filter((r) => r.id !== round.id)
    persist({ ...game, rounds, tiebreakerRounds: [...(game.tiebreakerRounds ?? []), round] })
    if (selectedRoundId === round.id) setSelectedRoundId(rounds[0]?.id ?? null)
  }

  function restoreReserve(round: SongRound) {
    if (!game) return
    persist({ ...game, rounds: [...game.rounds, round], tiebreakerRounds: (game.tiebreakerRounds ?? []).filter((r) => r.id !== round.id) })
    setSelectedRoundId(round.id)
  }

  function deleteReserve(round: SongRound) {
    if (!game) return
    persist({ ...game, tiebreakerRounds: (game.tiebreakerRounds ?? []).filter((r) => r.id !== round.id) })
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
        soundcloudSecretToken: t.soundcloudSecretToken,
        isPrivate: t.isPrivate,
        access: t.access,
        duration: t.duration,
      }),
    )
    const rounds = [...game.rounds, ...newRounds]
    persist({ ...game, rounds })
    setSelectedRoundId(newRounds[0]?.id ?? selectedRoundId)
    showToast(`Added ${newRounds.length} track${newRounds.length === 1 ? '' : 's'}`)
  }

  function handleSpotifyImport(tracks: ImportableSpotifyTrack[]) {
    if (!game) return
    const newRounds = tracks.map((t) =>
      createEmptyRound({
        source: 'spotify',
        title: t.title,
        artist: t.artist,
        artworkUrl: t.artworkUrl,
        spotifyTrackId: t.spotifyTrackId,
        spotifyUri: t.spotifyUri,
        spotifyUrl: t.spotifyUrl,
        duration: t.duration,
      }),
    )
    const rounds = [...game.rounds, ...newRounds]
    persist({ ...game, rounds })
    setSelectedRoundId(newRounds[0]?.id ?? selectedRoundId)
    showToast(`Added ${newRounds.length} track${newRounds.length === 1 ? '' : 's'}`)
  }

  function handleAddLyricRound() {
    if (!game) return
    const round = createEmptyLyricRound()
    persist({ ...game, rounds: [...game.rounds, round] })
    setSelectedRoundId(round.id)
  }

  function openTierGuessImport() {
    if (!game) return
    // Already locked to a tier list — reuse it and skip straight to the song picker.
    if (game.sourceTierListId) {
      const list = getTierList(game.sourceTierListId)
      if (list) {
        setPickedTierList(list)
        setTierGuessImportOpen(true)
        return
      }
      // Source tier list was deleted since this game was built — let them pick a new one.
    }
    setTierListPickerOpen(true)
  }

  function handlePickTierList(list: TierList) {
    setPickedTierList(list)
    setTierListPickerOpen(false)
    setTierGuessImportOpen(true)
  }

  function handleImportTierGuessSongs(songs: TierListSong[]) {
    if (!game || !pickedTierList) return
    const newRounds = songs.map((song) => {
      const tierSize = pickedTierList.songs.filter((s) => s.tierId === song.tierId).length
      return createTierGuessRound(song, tierSize)
    })
    persist({
      ...game,
      rounds: [...game.rounds, ...newRounds],
      sourceTierListId: pickedTierList.id,
      tierListTiers: pickedTierList.tiers,
    })
    setSelectedRoundId(newRounds[0]?.id ?? selectedRoundId)
    showToast(`Added ${newRounds.length} song${newRounds.length === 1 ? '' : 's'}`)
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

  function applyBulkStart() {
    if (!game) return
    const clipStart = parseTimeToSeconds(bulkStartInput)
    persist({ ...game, rounds: game.rounds.map((r) => ({ ...r, clipStart })) })
    showToast(`Start time applied to ${game.rounds.length} track${game.rounds.length === 1 ? '' : 's'}`)
  }

  async function handleShare() {
    if (!game) return
    setShareStatus('Generating link…')
    try {
      const url = await buildShareUrl(game)
      setShareUrl(url)
      try {
        await navigator.clipboard.writeText(url)
        setShareStatus(url.length > 6000 ? 'Link copied (it\'s long — some apps may mishandle it).' : 'Link copied to clipboard!')
      } catch {
        setShareStatus('Copy failed — select the link below to copy it manually.')
      }
    } catch {
      setShareStatus('Could not generate a share link.')
    }
  }

  function renameTeam(id: string, name: string) {
    if (!game) return
    persist({ ...game, teams: game.teams.map((t) => (t.id === id ? { ...t, name } : t)) })
  }

  function updateTeamColor(id: string, color: string) {
    if (!game) return
    persist({ ...game, teams: game.teams.map((t) => (t.id === id ? { ...t, color } : t)) })
    setColorPickerTeamId(null)
  }

  function updateTeamAvatar(id: string, avatar: string) {
    if (!game) return
    persist({
      ...game,
      teams: game.teams.map((t) => (t.id === id ? { ...t, avatar: t.avatar === avatar ? undefined : avatar } : t)),
    })
    setAvatarPickerTeamId(null)
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

  function updateTags(tags: string[]) {
    if (!game) return
    persist({ ...game, tags })
  }

  if (!game) {
    return (
      <div className="flex min-h-svh items-center justify-center text-slate-400">
        Game not found. <Link to="/" className="ml-2 text-hardwood-400 underline">Back home</Link>
      </div>
    )
  }

  const isLyric = isLyricMode(game)
  const isTierGuess = isTierGuessMode(game)
  const isYear = isYearMode(game)
  const usedTrackIds = new Set(game.rounds.map((r) => r.soundcloudTrackId).filter((id): id is string => Boolean(id)))

  return (
    <div className="flex h-svh flex-col bg-arena-950">
      <header className="flex items-center justify-between border-b border-arena-700 px-6 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-slate-500 hover:text-slate-300">←</Link>
          <input
            value={game.name}
            onChange={(e) => persist({ ...game, name: e.target.value })}
            className="bg-transparent font-display text-2xl tracking-wide text-white outline-none focus:border-b focus:border-hardwood-500"
          />
          <span className="hidden text-xs text-slate-500 sm:inline" role="status">
            {game.rounds.length} {game.rounds.length === 1 ? 'possession' : 'possessions'} · {game.teams.length} teams ·{' '}
            <span className="text-scoreboard-green">
              ✓ {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'All changes saved'}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={game.rounds.length === 0}
            onClick={() => setAnswerKeyOpen(true)}
            className="rounded-full border border-arena-500 px-4 py-2 text-sm text-slate-300 disabled:opacity-30 hover:border-hardwood-500 hover:text-hardwood-400"
          >
            Answer Key
          </button>
          <button
            onClick={handleShare}
            className="rounded-full border border-arena-500 px-4 py-2 text-sm text-slate-300 hover:border-hardwood-500 hover:text-hardwood-400"
          >
            Share
          </button>
          <button
            disabled={game.rounds.length === 0}
            onClick={() => navigate(`/games/${game.id}/present`)}
            className="rounded-full bg-hardwood-500 px-6 py-2 font-semibold text-arena-950 disabled:opacity-30 hover:bg-hardwood-400"
          >
            PRESENT ▶
          </button>
        </div>
      </header>

      {shareStatus && (
        <div className="border-b border-arena-700 bg-arena-900/80 px-6 py-3">
          <p className="text-sm text-slate-300">{shareStatus}</p>
          {shareUrl && (
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-2 w-full rounded-lg border border-arena-600 bg-arena-800 px-3 py-1.5 text-xs text-slate-400 outline-none focus:border-hardwood-500"
            />
          )}
          <button onClick={() => { setShareStatus(null); setShareUrl(null) }} className="mt-2 text-xs text-slate-500 hover:text-slate-300">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-arena-700 bg-arena-900/60 p-3">
          {game.rounds.map((round, i) => (
            <div
              key={round.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                setDraggingIndex(i)
              }}
              onDragEnd={() => {
                setDraggingIndex(null)
                setDragOverIndex(null)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverIndex((prev) => (prev === i ? prev : i))
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (draggingIndex !== null && draggingIndex !== i) reorder(draggingIndex, i)
                setDraggingIndex(null)
                setDragOverIndex(null)
              }}
              onClick={() => setSelectedRoundId(round.id)}
              className={`group mb-2 flex cursor-grab items-center gap-2 rounded-lg border p-2 transition-colors active:cursor-grabbing ${
                draggingIndex === i
                  ? 'border-hardwood-500 opacity-30'
                  : dragOverIndex === i && draggingIndex !== null
                    ? 'border-hardwood-500 bg-hardwood-500/10'
                    : selectedRoundId === round.id
                      ? 'border-hardwood-500 bg-arena-800'
                      : 'border-arena-700 hover:border-arena-600'
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
              {/* Always visible, not hover-gated — hover never fires on a touchscreen, and
                  these (plus drag itself) were the only way to reorder or remove a round,
                  which made both silently unreachable on a phone/tablet. The ▲▼ pair is
                  also the keyboard-usable alternative to drag for anyone not using a mouse. */}
              <div className="flex shrink-0 flex-col gap-0.5">
                <div className="flex gap-0.5">
                  <button
                    disabled={i === 0}
                    onClick={(e) => { e.stopPropagation(); reorder(i, i - 1) }}
                    className="text-xs text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:hover:text-slate-500"
                    title="Move up"
                    aria-label={`Move "${round.title || 'this round'}" up`}
                  >
                    ▲
                  </button>
                  <button
                    disabled={i === game.rounds.length - 1}
                    onClick={(e) => { e.stopPropagation(); reorder(i, i + 1) }}
                    className="text-xs text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:hover:text-slate-500"
                    title="Move down"
                    aria-label={`Move "${round.title || 'this round'}" down`}
                  >
                    ▼
                  </button>
                </div>
                <div className="flex gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); duplicateRound(round) }} className="text-xs text-slate-500 hover:text-slate-200" title="Duplicate">⧉</button>
                  {suddenDeathEnabled && (
                    <button onClick={(e) => { e.stopPropagation(); reserveRound(round) }} className="text-xs text-slate-500 hover:text-hardwood-400" title="Hold in reserve for a sudden-death tiebreaker" aria-label={`Hold "${round.title || 'this round'}" in reserve for a tiebreaker`}>🥇</button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); removeRound(round.id) }} className="text-xs text-slate-500 hover:text-scoreboard-500" title="Delete">✕</button>
                </div>
              </div>
            </div>
          ))}

          {suddenDeathEnabled && (game.tiebreakerRounds?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-lg border border-arena-700 p-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">🥇 Tiebreaker reserve</div>
              {(game.tiebreakerRounds ?? []).map((r) => (
                <div key={r.id} className="flex items-center gap-2 py-0.5 text-xs text-slate-300">
                  <span className="min-w-0 flex-1 truncate">{r.title || 'Untitled'}</span>
                  <button onClick={() => restoreReserve(r)} className="text-slate-500 hover:text-slate-200" title="Put back in the game">↩</button>
                  <button onClick={() => deleteReserve(r)} className="text-slate-500 hover:text-scoreboard-500" title="Delete">✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 space-y-2">
            {isLyric ? (
              <button
                onClick={handleAddLyricRound}
                className="w-full rounded-lg border border-dashed border-hardwood-500/50 py-2 text-sm font-medium text-hardwood-400 hover:bg-hardwood-500/10"
              >
                + ADD LYRIC ROUND
              </button>
            ) : isTierGuess ? (
              <button
                onClick={openTierGuessImport}
                className="w-full rounded-lg border border-dashed border-hardwood-500/50 py-2 text-sm font-medium text-hardwood-400 hover:bg-hardwood-500/10"
              >
                + ADD SONGS FROM TIER LIST
              </button>
            ) : (
              <>
                <button
                  onClick={() => setImportOpen(true)}
                  className="w-full rounded-lg border border-dashed border-hardwood-500/50 py-2 text-sm font-medium text-hardwood-400 hover:bg-hardwood-500/10"
                >
                  + ADD FROM SOUNDCLOUD
                </button>
                {spotifyImportEnabled && (
                  <button
                    onClick={() => setSpotifyImportOpen(true)}
                    className="mt-2 w-full rounded-lg border border-dashed border-[#1DB954]/50 py-2 text-sm font-medium text-[#1ed760] hover:bg-[#1DB954]/10"
                  >
                    + ADD FROM SPOTIFY
                  </button>
                )}
              </>
            )}
            <div className="flex gap-2">
              {!isLyric && !isTierGuess && (
                <button onClick={() => localFileInput.current?.click()} className="flex-1 rounded-lg border border-arena-600 py-1.5 text-xs text-slate-400 hover:border-arena-500">
                  + Local audio
                </button>
              )}
              {game.rounds.length > 1 && (
                <button onClick={shuffleRounds} className="flex-1 rounded-lg border border-arena-600 py-1.5 text-xs text-slate-400 hover:border-arena-500">
                  Shuffle
                </button>
              )}
            </div>
            <input ref={localFileInput} type="file" accept="audio/*" className="hidden" onChange={handleAddLocalFile} />
          </div>

          {!isLyric && !isTierGuess && game.rounds.length > 1 && (
            <BuilderSection id="auto" title="Auto Configure">
              <label className="mb-1 block text-xs text-slate-500">Start (m:ss)</label>
              <div className="flex gap-2">
                <input
                  value={bulkStartInput}
                  onChange={(e) => setBulkStartInput(e.target.value)}
                  placeholder="0:00"
                  className="w-full rounded-md border border-arena-700 bg-arena-800 px-2 py-1 text-sm text-slate-100 outline-none focus:border-hardwood-500"
                />
              </div>
              <button
                onClick={applyBulkStart}
                className="mt-2 w-full rounded-lg border border-dashed border-arena-600 py-1.5 text-xs text-slate-400 hover:border-hardwood-500 hover:text-hardwood-400"
              >
                Apply start to all {game.rounds.length} tracks
              </button>
            </BuilderSection>
          )}

          {(isLyric || isTierGuess || isYear) && (
            <BuilderSection id="timer" title="Answer Timer" summary={(game.answerTimerSeconds ?? DEFAULT_ANSWER_TIMER_SECONDS) + 's'}>
              <label className="mb-1 block text-xs text-slate-500">Seconds to think before reveal</label>
              <input
                type="number"
                min={5}
                max={120}
                value={game.answerTimerSeconds ?? DEFAULT_ANSWER_TIMER_SECONDS}
                onChange={(e) => {
                  const seconds = Math.max(5, Math.min(120, Number(e.target.value) || DEFAULT_ANSWER_TIMER_SECONDS))
                  persist({ ...game, answerTimerSeconds: seconds })
                }}
                className="w-full rounded-md border border-arena-700 bg-arena-800 px-2 py-1 text-sm text-slate-100 outline-none focus:border-hardwood-500"
              />
            </BuilderSection>
          )}

          <BuilderSection id="rules" title="Game rules">
            <div className="mb-3">
              <ModeRulesCard mode={game.mode ?? 'song'} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={game.halftimeEnabled ?? false}
                onChange={(e) => persist({ ...game, halftimeEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-arena-600 bg-arena-800 accent-hardwood-500"
              />
              🏀 Halftime break
            </label>
            <p className="mt-1 text-xs text-slate-500">Pause for a score check partway through (needs at least 4 possessions).</p>
            {(
              <>
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={game.catchUp ?? false}
                    onChange={(e) => persist({ ...game, catchUp: e.target.checked })}
                    className="h-4 w-4 rounded border-arena-600 bg-arena-800 accent-hardwood-500"
                  />
                  🐕 Underdog catch-up
                </label>
                <p className="mt-1 text-xs text-slate-500">Trailing by 8+ earns a bonus point on a correct answer; falling 12+ behind gifts a free Steal (needs Power-Ups).</p>
              </>
            )}
          </BuilderSection>

          {powerUpsEnabled && (
            <BuilderSection id="powerups" title="Power-ups">
              <label className="mb-2 flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={game.earnedPowerUps ?? false}
                  onChange={(e) => persist({ ...game, earnedPowerUps: e.target.checked })}
                  className="h-4 w-4 rounded border-arena-600 bg-arena-800 accent-hardwood-500"
                />
                🎁 Earn power-ups from streaks
              </label>
              {game.earnedPowerUps ? (
                <p className="text-xs text-slate-500">
                  Teams start with none and earn a random Double, Steal, or Freeze for every second scored possession in a row.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3">
                    {POWER_UP_KINDS.map((kind: PowerUpKind) => (
                      <label key={kind} className="flex items-center gap-1.5 text-sm text-slate-300">
                        {kind === 'double' ? '2x Double' : kind === 'steal' ? '🥷 Steal' : '🧊 Freeze'}
                        <input
                          type="number"
                          min={0}
                          max={9}
                          value={game.powerUpAllowance?.[kind] ?? DEFAULT_POWER_UPS_PER_TEAM}
                          onChange={(e) => {
                            const n = Math.min(9, Math.max(0, Math.floor(Number(e.target.value) || 0)))
                            persist({ ...game, powerUpAllowance: { ...game.powerUpAllowance, [kind]: n } })
                          }}
                          className="w-14 rounded-lg border border-arena-600 bg-arena-800 px-2 py-1 text-center text-slate-100 outline-none focus:border-hardwood-500"
                        />
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">How many of each a team can use this game (0 turns one off).</p>
                </>
              )}
            </BuilderSection>
          )}

          <BuilderSection id="teams" title="Teams" summary={`${game.teams.length} teams`}>
            <div className="space-y-1.5">
              {game.teams.map((team) => (
                <div key={team.id} className="relative flex items-center gap-2">
                  <button
                    onClick={() => setColorPickerTeamId(colorPickerTeamId === team.id ? null : team.id)}
                    aria-label={`Change ${team.name}'s color`}
                    className="h-4 w-4 shrink-0 rounded-full ring-1 ring-arena-600 ring-offset-1 ring-offset-arena-800 hover:ring-hardwood-500"
                    style={{ background: team.color }}
                  />
                  <button
                    onClick={() => setAvatarPickerTeamId(avatarPickerTeamId === team.id ? null : team.id)}
                    aria-label={`Change ${team.name}'s mascot`}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded ring-1 ring-arena-600 hover:ring-hardwood-500"
                  >
                    <span className="text-xs">{team.avatar ?? '＋'}</span>
                  </button>
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
                  {colorPickerTeamId === team.id && (
                    <>
                      <div className="fixed inset-0 z-0" onClick={() => setColorPickerTeamId(null)} />
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-0 top-7 z-10 flex flex-wrap gap-1.5 rounded-lg border border-arena-600 bg-arena-900 p-2 shadow-xl"
                      >
                        {TEAM_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => updateTeamColor(team.id, color)}
                            aria-label={`Use ${color}`}
                            className={`h-5 w-5 rounded-full ${team.color === color ? 'ring-2 ring-white' : 'ring-1 ring-arena-600 hover:ring-slate-300'}`}
                            style={{ background: color }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  {avatarPickerTeamId === team.id && (
                    <>
                      <div className="fixed inset-0 z-0" onClick={() => setAvatarPickerTeamId(null)} />
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-4 top-7 z-10 flex w-40 flex-wrap gap-1.5 rounded-lg border border-arena-600 bg-arena-900 p-2 shadow-xl"
                      >
                        {TEAM_AVATARS.map((avatar) => (
                          <button
                            key={avatar}
                            onClick={() => updateTeamAvatar(team.id, avatar)}
                            aria-label={`Use ${avatar}`}
                            className={`flex h-6 w-6 items-center justify-center rounded text-sm ${
                              team.avatar === avatar ? 'bg-hardwood-500/30 ring-2 ring-hardwood-500' : 'ring-1 ring-arena-600 hover:ring-slate-300'
                            }`}
                          >
                            {avatar}
                          </button>
                        ))}
                      </div>
                    </>
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
          </BuilderSection>

          <BuilderSection id="tags" title="Tags" summary={(game.tags ?? []).join(', ') || 'none'}>
            <TagInput tags={game.tags ?? []} onChange={updateTags} suggestions={tagSuggestions} listId="game-tag-suggestions" />
          </BuilderSection>
        </aside>

        <main className="flex-1 overflow-y-auto p-8">
          {!selectedRound ? (
            isTierGuess ? (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  icon="🎯"
                  action={<Button onClick={openTierGuessImport}>{game.sourceTierListId ? '+ ADD SONGS' : 'PICK A TIER LIST'}</Button>}
                >
                  {game.sourceTierListId ? 'No songs yet — add some from your tier list to get started.' : 'Pick a tier list to build this game from.'}
                </EmptyState>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  icon={isLyric ? '📝' : '🎵'}
                  action={
                    <Button onClick={() => (isLyric ? handleAddLyricRound() : setImportOpen(true))}>
                      {isLyric ? '+ ADD LYRIC ROUND' : '+ ADD FROM SOUNDCLOUD'}
                    </Button>
                  }
                >
                  {isLyric ? 'No rounds yet. Add one and type in the clues.' : 'No possessions yet. Import tracks from SoundCloud to get started.'}
                </EmptyState>
              </div>
            )
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
                    className="w-full bg-transparent text-2xl font-semibold text-slate-100 outline-none focus:border-b focus:border-hardwood-500"
                  />
                  <input
                    value={selectedRound.artist}
                    onChange={(e) => updateRound({ ...selectedRound, artist: e.target.value })}
                    className="w-full bg-transparent text-slate-400 outline-none focus:border-b focus:border-hardwood-500"
                  />
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    {isTierGuess ? (
                      <span className="rounded bg-hardwood-500/15 px-2 py-0.5 text-hardwood-400">🎯 Tier Guess</span>
                    ) : isYear ? (
                      <span className="rounded bg-hardwood-500/15 px-2 py-0.5 text-hardwood-400">📅 Guess the Year</span>
                    ) : selectedRound.source === 'soundcloud' ? (
                      <span className="rounded bg-hardwood-500/15 px-2 py-0.5 text-hardwood-400">SoundCloud</span>
                    ) : selectedRound.source === 'spotify' ? (
                      <span className="rounded bg-[#1DB954]/15 px-2 py-0.5 text-[#1ed760]">Spotify</span>
                    ) : null}
                    {selectedRound.source === 'local' && (
                      <span className="rounded bg-arena-600 px-2 py-0.5 text-slate-300">Local audio</span>
                    )}
                    {selectedRound.source === 'lyric' && (
                      <span className="rounded bg-arena-600 px-2 py-0.5 text-slate-300">📝 Lyric round</span>
                    )}
                    {selectedRound.isPrivate && <span className="rounded bg-arena-600 px-2 py-0.5 text-slate-300">🔒 Private</span>}
                    {selectedRound.soundcloudUrl && (
                      <a href={selectedRound.soundcloudUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-hardwood-400">
                        View on SoundCloud ↗
                      </a>
                    )}
                    {selectedRound.spotifyUrl && (
                      <a href={selectedRound.spotifyUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-[#1ed760]">
                        View on Spotify ↗
                      </a>
                    )}
                  </div>
                  {!isTierGuess && !isYear && (
                    <label className="mt-2 flex w-fit items-center gap-1.5 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={selectedRound.wager ?? false}
                        onChange={(e) => updateRound({ ...selectedRound, wager: e.target.checked })}
                        className="accent-hardwood-500"
                      />
                      ⭐ Wager round (host picks one team to bet points on, live)
                    </label>
                  )}
                </div>
              </div>

              {isYear && (
                <Panel>
                  <div className="mb-2 text-sm text-slate-400">The answer for this round</div>
                  <div className="flex items-center gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">Release year</label>
                      <input
                        type="number"
                        min={1900}
                        max={2100}
                        value={selectedRound.releaseYear ?? ''}
                        onChange={(e) => updateRound({ ...selectedRound, releaseYear: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="e.g. 2003"
                        className="w-28 rounded-lg border border-arena-600 bg-arena-900 px-3 py-2 text-slate-100 outline-none focus:border-hardwood-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">Release month</label>
                      <select
                        value={selectedRound.releaseMonth ?? ''}
                        onChange={(e) => updateRound({ ...selectedRound, releaseMonth: e.target.value ? Number(e.target.value) : undefined })}
                        className="rounded-lg border border-arena-600 bg-arena-900 px-3 py-2 text-slate-100 outline-none focus:border-hardwood-500"
                      >
                        <option value="">Unknown</option>
                        {MONTH_NAMES.map((name, i) => (
                          <option key={name} value={i + 1}>{name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </Panel>
              )}

              {isLyric ? (
                <LyricEditor round={selectedRound} onChange={updateRound} />
              ) : isTierGuess ? (
                <Panel>
                  <div className="mb-2 text-sm text-slate-400">The answer for this round</div>
                  {(() => {
                    const tier = game.tierListTiers?.find((t) => t.id === selectedRound.tierId)
                    return (
                      <div className="flex items-center gap-3">
                        <span className="rounded-full px-3 py-1 font-display text-sm text-arena-950" style={{ background: tier?.color ?? '#888' }}>
                          {tier?.name ?? 'Unranked'}
                        </span>
                        {selectedRound.tierPosition !== undefined && (
                          <span className="text-slate-300">
                            #{selectedRound.tierPosition + 1} of {selectedRound.tierSize ?? '?'}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                  <p className="mt-3 text-xs text-slate-500">
                    Snapshotted from the tier list when this song was added — re-add it from the tier list to refresh if the
                    ranking has changed since.
                  </p>
                </Panel>
              ) : (
                <ClipEditor round={selectedRound} onChange={updateRound} />
              )}
            </div>
          )}
        </main>
      </div>

      {importOpen && <ImportSoundCloudModal onClose={() => setImportOpen(false)} onImport={handleImport} />}

      {spotifyImportOpen && <ImportSpotifyModal onClose={() => setSpotifyImportOpen(false)} onImport={handleSpotifyImport} />}

      {tierListPickerOpen && (
        <TierListPickerModal tierLists={listTierLists()} onClose={() => setTierListPickerOpen(false)} onPick={handlePickTierList} />
      )}

      {tierGuessImportOpen && pickedTierList && (
        <ImportFromTierListModal
          tierList={pickedTierList}
          excludeTrackIds={usedTrackIds}
          onClose={() => setTierGuessImportOpen(false)}
          onImport={handleImportTierGuessSongs}
        />
      )}

      {answerKeyOpen && <AnswerKeyModal game={game} onClose={() => setAnswerKeyOpen(false)} />}
    </div>
  )
}
