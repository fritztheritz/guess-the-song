import { useEffect, useState, type DragEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { TierList, TierListSong } from '../types/tierlist'
import { getTierList, saveTierList } from '../lib/storage/tierlist-repository'
import { moveSong, songsInGroup } from '../lib/tierlist-ranking'

// Sentinel for "currently dragging over the Unranked pool" — distinct from tier ids
// (real uuids) and from `null` (no drag in progress), so the two are never confused.
const UNRANKED_ZONE = '__unranked__'

function resolveBeforeId(groupSongs: TierListSong[], hoveredId: string, after: boolean): string | null {
  const idx = groupSongs.findIndex((s) => s.id === hoveredId)
  if (idx === -1) return null
  return after ? (groupSongs[idx + 1]?.id ?? null) : groupSongs[idx].id
}

function SongTile({
  song,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOverTile,
  onDropOnTile,
}: {
  song: TierListSong
  dragging: boolean
  onDragStart: (e: DragEvent, songId: string) => void
  onDragEnd: () => void
  onDragOverTile: () => void
  onDropOnTile: (e: DragEvent, songId: string, after: boolean) => void
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
      title={`${song.title} — ${song.artist}. Click to listen on SoundCloud, drag to rank.`}
      className={`group relative h-24 w-24 shrink-0 cursor-grab select-none overflow-hidden rounded-lg border transition-opacity active:cursor-grabbing ${
        dragging ? 'border-hardwood-500 opacity-30' : 'border-arena-600 bg-arena-700'
      }`}
    >
      {song.soundcloudUrl ? (
        <a href={song.soundcloudUrl} target="_blank" rel="noopener noreferrer" className="block h-full w-full" draggable={false}>
          {inner}
        </a>
      ) : (
        inner
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

export default function TierListPresent() {
  const { tierListId } = useParams()
  const [list, setList] = useState<TierList | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverZone, setDragOverZone] = useState<string | null>(null)

  useEffect(() => {
    if (!tierListId) return
    setList(getTierList(tierListId))
  }, [tierListId])

  function persist(next: TierList) {
    setList(saveTierList(next))
  }

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

  function drop(targetTierId: string | null, beforeSongId: string | null) {
    if (!list || !draggingId) return
    persist(moveSong(list, draggingId, targetTierId, beforeSongId))
    setDraggingId(null)
    setDragOverZone(null)
  }

  function handleDragOverZone(zoneId: string) {
    setDragOverZone((prev) => (prev === zoneId ? prev : zoneId))
  }

  function resetRankings() {
    if (!list) return
    if (!confirm('Move every song back to Unranked?')) return
    persist({ ...list, songs: list.songs.map((s, i) => ({ ...s, tierId: null, order: i })) })
  }

  if (!list) {
    return (
      <div className="flex min-h-svh items-center justify-center text-slate-400">
        {tierListId ? 'Loading…' : 'Tier list not found.'}
      </div>
    )
  }

  const unranked = songsInGroup(list, null)

  return (
    <div className="min-h-svh court-lines">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to={`/tierlists/${list.id}/edit`} className="text-sm text-slate-400 hover:text-hardwood-400">
              ← Edit
            </Link>
            <h1 className="font-display text-3xl tracking-wide text-white">{list.name}</h1>
          </div>
          <button onClick={resetRankings} className="text-xs text-slate-500 underline hover:text-slate-300">
            ↺ Reset rankings
          </button>
        </div>

        <div className="space-y-3">
          {list.tiers.map((tier) => {
            const tierSongs = songsInGroup(list, tier.id)
            return (
              <div key={tier.id} className="flex overflow-hidden rounded-xl border border-arena-600">
                <div
                  className="flex w-16 shrink-0 items-center justify-center px-2 text-center font-display text-xl text-arena-950 sm:w-20 sm:text-2xl"
                  style={{ background: tier.color }}
                >
                  {tier.name}
                </div>
                <DropZone
                  id={tier.id}
                  active={dragOverZone === tier.id}
                  onDragOverZone={handleDragOverZone}
                  onDropZone={() => drop(tier.id, null)}
                  className="flex min-h-[6.5rem] flex-1 flex-wrap items-start gap-2 bg-arena-800/60 p-2 transition-colors"
                >
                  {tierSongs.length === 0 && <div className="flex items-center px-2 text-xs text-slate-600">Drop songs here</div>}
                  {tierSongs.map((song) => (
                    <SongTile
                      key={song.id}
                      song={song}
                      dragging={draggingId === song.id}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragOverTile={() => handleDragOverZone(tier.id)}
                      onDropOnTile={(_e, songId, after) => drop(tier.id, resolveBeforeId(tierSongs, songId, after))}
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
              {unranked.map((song) => (
                <SongTile
                  key={song.id}
                  song={song}
                  dragging={draggingId === song.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOverTile={() => handleDragOverZone(UNRANKED_ZONE)}
                  onDropOnTile={(_e, songId, after) => drop(null, resolveBeforeId(unranked, songId, after))}
                />
              ))}
            </div>
          </DropZone>
        </div>
      </div>
    </div>
  )
}
