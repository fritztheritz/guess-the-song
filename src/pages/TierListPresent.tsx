import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { TierList, TierListSong } from '../types/tierlist'
import { getTierList, saveTierList } from '../lib/storage/tierlist-repository'
import { moveSong, rankedCount, songsInGroup, tierListResultsText } from '../lib/tierlist-ranking'
import { useToast } from '../state/toast-context'
import { playCorrect, playFanfare } from '../lib/sound-effects'
import SoundControl from '../components/SoundControl'
import Spinner from '../components/Spinner'
import Confetti from '../components/Confetti'
import ProgressRing from '../components/ProgressRing'
import Button from '../components/ui/Button'
import Kbd from '../components/Kbd'
import { downloadTierListImage } from '../lib/tierlist-image'
import { useStoredEntity } from '../lib/use-stored-entity'

// Sentinel for "currently dragging over the Unranked pool" — distinct from tier ids
// (real uuids) and from `null` (no drag in progress), so the two are never confused.
const UNRANKED_ZONE = '__unranked__'

function resolveBeforeId(groupSongs: TierListSong[], hoveredId: string, after: boolean): string | null {
  const idx = groupSongs.findIndex((s) => s.id === hoveredId)
  if (idx === -1) return null
  return after ? (groupSongs[idx + 1]?.id ?? null) : groupSongs[idx].id
}

interface TierChip {
  id: string | null
  name: string
  color?: string
}

// Native HTML5 drag-and-drop (the `draggable`/onDragStart below) never fires on a touch
// device at all — not clumsy, just silently inert on a phone or touchscreen tablet, which
// this app is routinely used on. The always-visible "⠿ Move" button opens a small popover
// (tap or keyboard, same as SoundControl's) offering the same two moves drag can do —
// place in a different tier, or nudge earlier/later within the current one — as a fallback
// that works everywhere drag doesn't, not a replacement for it on desktop.
function SongTile({
  song,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOverTile,
  onDropOnTile,
  chips,
  menuOpen,
  onToggleMenu,
  onPlace,
  canEarlier,
  canLater,
  onEarlier,
  onLater,
}: {
  song: TierListSong
  dragging: boolean
  onDragStart: (e: DragEvent, songId: string) => void
  onDragEnd: () => void
  onDragOverTile: () => void
  onDropOnTile: (e: DragEvent, songId: string, after: boolean) => void
  chips: TierChip[]
  menuOpen: boolean
  onToggleMenu: () => void
  onPlace: (tierId: string | null) => void
  canEarlier: boolean
  canLater: boolean
  onEarlier: () => void
  onLater: () => void
}) {
  function isAfter(e: DragEvent): boolean {
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientX - rect.left > rect.width / 2
  }

  const inner = (
    <>
      {song.artworkUrl ? (
        <img src={song.artworkUrl} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-2xl text-arena-500">♪</div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-1 text-[10px] leading-tight text-white">
        {song.title}
      </div>
    </>
  )

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, song.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        onDragOverTile()
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDropOnTile(e, song.id, isAfter(e))
      }}
      title={`${song.title} — ${song.artist}. Click to listen on SoundCloud, drag (or use the ⠿ button) to rank.`}
      className={`group relative h-24 w-24 shrink-0 cursor-grab select-none rounded-lg border transition-opacity active:cursor-grabbing ${
        dragging ? 'border-hardwood-500 opacity-30' : 'border-arena-600 bg-arena-700'
      }`}
    >
      {/* Clips just the artwork/title to the tile's rounded corners — kept off the outer
          div so the move button and its popover (siblings of this, below) aren't clipped
          along with it; they need to be able to render past the tile's own 96×96 box. */}
      <div className="h-full w-full overflow-hidden rounded-lg">
        {song.soundcloudUrl ? (
          <a href={song.soundcloudUrl} target="_blank" rel="noopener noreferrer" className="block h-full w-full" draggable={false}>
            {inner}
          </a>
        ) : (
          inner
        )}
      </div>

      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggleMenu()
        }}
        aria-label={`Move "${song.title}"`}
        aria-expanded={menuOpen}
        className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80 md:h-5 md:w-5 md:text-[10px]"
      >
        ⠿
      </button>

      {menuOpen && (
        <>
        <div aria-hidden className="fixed inset-0 z-30 bg-black/60 md:hidden" />
        <div
          data-tier-move-menu
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-x-0 bottom-0 z-40 space-y-3 rounded-t-2xl border border-arena-600 bg-arena-900 p-4 pb-6 text-left shadow-2xl md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-7 md:z-20 md:w-44 md:space-y-2 md:rounded-lg md:p-2"
        >
          <div className="truncate text-xs uppercase tracking-widest text-slate-500 md:text-[10px]" title={song.title}>
            Move “{song.title}” to…
          </div>
          <div className="flex flex-wrap gap-2 md:gap-1">
            {chips.map((chip) => (
              <button
                key={chip.id ?? '__unranked__'}
                onClick={() => onPlace(chip.id)}
                className="min-w-12 rounded-full px-4 py-2.5 text-base font-semibold md:min-w-0 md:px-2 md:py-1 md:text-[11px]"
                style={{ background: chip.color ? `${chip.color}33` : '#ffffff1a', color: chip.color ?? '#cbd5e1' }}
              >
                {chip.name}
              </button>
            ))}
          </div>
          <div className="flex gap-1 border-t border-arena-700 pt-2">
            <button
              disabled={!canEarlier}
              onClick={onEarlier}
              className="flex-1 rounded-lg border border-arena-600 py-2 text-sm text-slate-300 md:py-1 md:text-xs hover:border-hardwood-500 disabled:opacity-30 disabled:hover:border-arena-600"
            >
              ◀ Earlier
            </button>
            <button
              disabled={!canLater}
              onClick={onLater}
              className="flex-1 rounded-lg border border-arena-600 py-2 text-sm text-slate-300 md:py-1 md:text-xs hover:border-hardwood-500 disabled:opacity-30 disabled:hover:border-arena-600"
            >
              Later ▶
            </button>
          </div>
        </div>
        </>
      )}
    </div>
  )
}

function DropZone({
  id,
  active,
  onDragOverZone,
  onDropZone,
  className,
  children,
}: {
  id: string
  active: boolean
  onDragOverZone: (id: string) => void
  onDropZone: (id: string) => void
  className: string
  children: React.ReactNode
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOverZone(id)
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDropZone(id)
      }}
      className={`${className} ${active ? 'ring-2 ring-hardwood-500 ring-inset bg-hardwood-500/10' : ''}`}
    >
      {children}
    </div>
  )
}

const HISTORY_LIMIT = 30

/** True when the keypress is going into a text field (or a modifier combo), so shortcuts stay out of the way. */
function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

/** The tier a keypress names: its 1-based digit, or its first letter when that's unique among the tiers. */
function tierForKey(tiers: TierList['tiers'], key: string): string | null {
  if (/^[1-9]$/.test(key)) return tiers[Number(key) - 1]?.id ?? null
  const k = key.toLowerCase()
  if (k.length !== 1) return null
  const matches = tiers.filter((t) => t.name.trim().toLowerCase().startsWith(k))
  return matches.length === 1 ? matches[0].id : null
}

export default function TierListPresent() {
  const { tierListId } = useParams()
  const showToast = useToast()
  const [list, setList] = useStoredEntity(tierListId, getTierList)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverZone, setDragOverZone] = useState<string | null>(null)
  const [celebrating, setCelebrating] = useState(false)
  // Non-drag ranking path (see SongTile's comment) — which tile's move popover is open,
  // if any. Only one at a time, so a single id is enough.
  const [openMoveId, setOpenMoveId] = useState<string | null>(null)
  // Snapshots from before each change, newest last — what Undo steps back through.
  const [history, setHistory] = useState<TierList[]>([])
  const listRef = useRef(list)
  useEffect(() => {
    listRef.current = list
  }, [list])

  useEffect(() => {
    if (!openMoveId) return
    function onPointerDown(e: PointerEvent) {
      if (!(e.target as HTMLElement).closest('[data-tier-move-menu], [aria-label^="Move "]')) setOpenMoveId(null)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMoveId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openMoveId])

  function persist(next: TierList) {
    if (list) setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), list])
    setList(saveTierList(next))
  }

  const undo = useCallback(() => {
    setHistory((h) => {
      const prev = h[h.length - 1]
      if (!prev) return h
      setList(saveTierList(prev))
      return h.slice(0, -1)
    })
  }, [setList])

  function handleDragStart(e: DragEvent, songId: string) {
    e.dataTransfer.setData('text/plain', songId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(songId)
  }

  // Fires whether the drag ended in a successful drop or was cancelled (dropped outside
  // any zone, Escape pressed, etc.) — the one place that's guaranteed to run, so it's the
  // reliable spot to clear drag state and avoid a stuck "dimmed tile"/"highlighted row".
  function handleDragEnd() {
    setDraggingId(null)
    setDragOverZone(null)
  }

  // Shared by the drag path (drop, below), the tap-to-move popover and the Up next card —
  // same move, same sound/celebration rules, just different ways of naming the song and
  // the target.
  function applyMove(songId: string, targetTierId: string | null, beforeSongId: string | null) {
    if (!list) return
    const moving = list.songs.find((s) => s.id === songId)
    const wasFullyRanked = list.songs.every((s) => s.tierId !== null)
    const next = moveSong(list, songId, targetTierId, beforeSongId)
    const nowFullyRanked = next.songs.every((s) => s.tierId !== null)

    // The "everything's ranked" celebration takes priority over the per-placement chime —
    // playing both back to back would just sound like a glitch, not two distinct cues.
    if (!wasFullyRanked && nowFullyRanked) {
      playFanfare()
      setCelebrating(true)
      setTimeout(() => setCelebrating(false), 3000)
    } else if (targetTierId !== null && moving?.tierId !== targetTierId) {
      playCorrect()
    }

    persist(next)
  }

  function drop(targetTierId: string | null, beforeSongId: string | null) {
    if (!draggingId) return
    applyMove(draggingId, targetTierId, beforeSongId)
    setDraggingId(null)
    setDragOverZone(null)
  }

  function handleDragOverZone(zoneId: string) {
    setDragOverZone((prev) => (prev === zoneId ? prev : zoneId))
  }

  // Tap-to-move popover — always lands at the end of the target tier (fine positioning is
  // still what drag is for); ◀/▶ nudge a song one spot within its current tier instead.
  function placeSongInTier(songId: string, targetTierId: string | null) {
    applyMove(songId, targetTierId, null)
    setOpenMoveId(null)
  }

  function nudgeSong(songId: string, direction: 'earlier' | 'later') {
    if (!list) return
    const song = list.songs.find((s) => s.id === songId)
    if (!song) return
    const group = songsInGroup(list, song.tierId)
    const idx = group.findIndex((s) => s.id === songId)
    if (idx === -1) return
    if (direction === 'earlier') {
      if (idx === 0) return
      applyMove(songId, song.tierId, group[idx - 1].id)
    } else {
      if (idx === group.length - 1) return
      applyMove(songId, song.tierId, group[idx + 2]?.id ?? null)
    }
    setOpenMoveId(null)
  }

  // Sends the current "up next" song to the back of the pool, so a song you can't place yet
  // doesn't block the rest.
  function skipUpNext() {
    if (!list) return
    const pool = songsInGroup(list, null)
    if (pool.length < 2) return
    persist(moveSong(list, pool[0].id, null, null))
  }

  // No confirm dialog — a reset is one Undo away, which is easier on a mis-tap than a prompt.
  function resetRankings() {
    if (!list || rankedCount(list) === 0) return
    persist({ ...list, songs: list.songs.map((s, i) => ({ ...s, tierId: null, order: i })) })
    showToast('All songs moved to Unranked', { action: { label: 'Undo', onAction: undo } })
  }

  async function copyResults() {
    if (!list) return
    try {
      await navigator.clipboard.writeText(tierListResultsText(list))
      showToast('Tier list copied to clipboard!')
    } catch {
      showToast('Could not copy the tier list.')
    }
  }

  // Keyboard path: a tier's number (or unique first letter) files the Up next song, → skips,
  // ⌘/Ctrl+Z undoes. Reads the list through a ref so the listener doesn't re-bind every move.
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    shortcutRef.current = (e: KeyboardEvent) => {
      const current = listRef.current
      if (!current || isTypingTarget(e)) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const next = songsInGroup(current, null)[0]
      if (!next) return
      if (e.key === 'ArrowRight') {
        skipUpNext()
        return
      }
      const tierId = tierForKey(current.tiers, e.key)
      if (tierId) applyMove(next.id, tierId, null)
    }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcutRef.current(e)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (!list) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 text-slate-400">
        {tierListId ? (
          <>
            <Spinner />
            <span>Loading…</span>
          </>
        ) : (
          'Tier list not found.'
        )}
      </div>
    )
  }

  const unranked = songsInGroup(list, null)
  const ranked = rankedCount(list)
  const upNext = unranked[0]
  const allRanked = list.songs.length > 0 && unranked.length === 0
  // Every tier plus a synthetic "Unranked" entry — the popover's "move to" chip set, before
  // each tile filters out whichever one it's currently sitting in.
  const allChips: TierChip[] = [...list.tiers.map((t) => ({ id: t.id, name: t.name, color: t.color })), { id: null, name: 'Unranked' }]
  const topTier = list.tiers.find((t) => songsInGroup(list, t.id).length > 0)

  return (
    <div className="min-h-svh court-lines">
      <div className="sticky top-0 z-20 border-b border-arena-700 bg-arena-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <ProgressRing value={ranked} max={list.songs.length} size={48} label="songs ranked" />
            <div className="min-w-0">
              <Link to={`/tierlists/${list.id}/edit`} className="text-xs text-slate-400 hover:text-hardwood-400">
                ← Edit
              </Link>
              <h1 className="truncate font-display text-2xl leading-tight tracking-wide text-white">{list.name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SoundControl />
            <Button variant="outline" size="sm" onClick={undo} disabled={history.length === 0} title="Undo the last move (⌘/Ctrl+Z)">
              ↶ Undo
            </Button>
            <Button variant="outline" size="sm" onClick={resetRankings} disabled={ranked === 0}>
              Reset
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {celebrating && <Confetti />}

        {list.songs.length === 0 ? (
          <div className="mb-6 rounded-xl border border-dashed border-arena-600 p-8 text-center text-slate-400">
            This tier list has no songs yet.{' '}
            <Link to={`/tierlists/${list.id}/edit`} className="text-hardwood-400 underline">
              Add some
            </Link>
          </div>
        ) : allRanked ? (
          <div className="mb-6 rounded-2xl border border-hardwood-500/40 bg-hardwood-500/10 p-5 text-center">
            <div className="font-display text-3xl tracking-wide text-hardwood-400">🏆 ALL RANKED</div>
            {topTier && (
              <p className="mt-1 text-sm text-slate-300">
                Top tier ({topTier.name}): {songsInGroup(list, topTier.id).map((s) => s.title).join(' · ')}
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button onClick={copyResults}>📋 Copy results</Button>
              <Button variant="outline" onClick={() => downloadTierListImage(list)}>
                🖼 Save image
              </Button>
            </div>
            <p className="mt-3 text-xs text-slate-500">Still tweaking? Keep dragging below — everything is saved as you go.</p>
          </div>
        ) : (
          upNext && (
            <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-arena-600 bg-arena-800/70 p-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-4">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-arena-700 shadow-lg">
                  {upNext.artworkUrl ? (
                    <img src={upNext.artworkUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl text-arena-500">♪</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Up next · {unranked.length} to go</div>
                  <div className="truncate font-display text-2xl text-white" title={upNext.title}>
                    {upNext.title}
                  </div>
                  <div className="truncate text-sm text-slate-400">{upNext.artist}</div>
                  {upNext.soundcloudUrl && (
                    <a href={upNext.soundcloudUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-hardwood-400 hover:underline">
                      ▶ Listen on SoundCloud
                    </a>
                  )}
                </div>
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
                {list.tiers.map((tier, i) => (
                  <button
                    key={tier.id}
                    onClick={() => applyMove(upNext.id, tier.id, null)}
                    className="rounded-full px-4 py-2.5 text-base font-semibold text-arena-950 transition-transform hover:scale-105 active:scale-95"
                    style={{ background: tier.color }}
                  >
                    {tier.name}
                    {i < 9 && <Kbd>{String(i + 1)}</Kbd>}
                  </button>
                ))}
                {unranked.length > 1 && (
                  <button onClick={skipUpNext} className="rounded-full border border-arena-500 px-4 py-2.5 text-sm text-slate-300 hover:border-hardwood-500">
                    Skip →
                  </button>
                )}
              </div>
            </div>
          )
        )}

        <div className="space-y-3">
          {list.tiers.map((tier) => {
            const tierSongs = songsInGroup(list, tier.id)
            return (
              <div key={tier.id} className="flex rounded-xl border border-arena-600">
                <div
                  className="flex w-16 shrink-0 items-center justify-center rounded-l-xl px-2 text-center font-display text-xl text-arena-950 sm:w-20 sm:text-2xl"
                  style={{ background: tier.color }}
                >
                  {tier.name}
                </div>
                <DropZone
                  id={tier.id}
                  active={dragOverZone === tier.id}
                  onDragOverZone={handleDragOverZone}
                  onDropZone={() => drop(tier.id, null)}
                  className="flex min-h-[6.5rem] flex-1 flex-wrap items-start gap-2 overflow-visible rounded-r-xl bg-arena-800/60 p-2 transition-colors"
                >
                  {tierSongs.length === 0 && <div className="flex items-center px-2 text-xs text-slate-600">Drop songs here</div>}
                  {tierSongs.map((song, i) => (
                    <SongTile
                      key={song.id}
                      song={song}
                      dragging={draggingId === song.id}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragOverTile={() => handleDragOverZone(tier.id)}
                      onDropOnTile={(_e, songId, after) => drop(tier.id, resolveBeforeId(tierSongs, songId, after))}
                      chips={allChips.filter((c) => c.id !== tier.id)}
                      menuOpen={openMoveId === song.id}
                      onToggleMenu={() => setOpenMoveId((prev) => (prev === song.id ? null : song.id))}
                      onPlace={(targetTierId) => placeSongInTier(song.id, targetTierId)}
                      canEarlier={i > 0}
                      canLater={i < tierSongs.length - 1}
                      onEarlier={() => nudgeSong(song.id, 'earlier')}
                      onLater={() => nudgeSong(song.id, 'later')}
                    />
                  ))}
                </DropZone>
              </div>
            )
          })}
        </div>

        <div className="mt-6">
          <DropZone
            id={UNRANKED_ZONE}
            active={dragOverZone === UNRANKED_ZONE}
            onDragOverZone={handleDragOverZone}
            onDropZone={() => drop(null, null)}
            className="rounded-xl border border-dashed border-arena-600 bg-arena-900/40 p-3 transition-colors"
          >
            <div className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-500">
              Unranked ({unranked.length})
            </div>
            <div className="flex min-h-[6.5rem] flex-wrap items-start gap-2">
              {unranked.length === 0 && <div className="flex items-center px-2 text-xs text-slate-600">Everything's ranked 🎉</div>}
              {unranked.map((song, i) => (
                <SongTile
                  key={song.id}
                  song={song}
                  dragging={draggingId === song.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOverTile={() => handleDragOverZone(UNRANKED_ZONE)}
                  onDropOnTile={(_e, songId, after) => drop(null, resolveBeforeId(unranked, songId, after))}
                  chips={allChips.filter((c) => c.id !== null)}
                  menuOpen={openMoveId === song.id}
                  onToggleMenu={() => setOpenMoveId((prev) => (prev === song.id ? null : song.id))}
                  onPlace={(targetTierId) => placeSongInTier(song.id, targetTierId)}
                  canEarlier={i > 0}
                  canLater={i < unranked.length - 1}
                  onEarlier={() => nudgeSong(song.id, 'earlier')}
                  onLater={() => nudgeSong(song.id, 'later')}
                />
              ))}
            </div>
          </DropZone>
        </div>
      </div>
    </div>
  )
}
