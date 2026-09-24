import { useEffect, useState, type DragEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { TierList, TierListSong } from '../types/tierlist'
import { getTierList, saveTierList } from '../lib/storage/tierlist-repository'
import { moveSong, songsInGroup } from '../lib/tierlist-ranking'

function SongTile({ song, onDragStart, onDragOverTile, onDropOnTile }: {
  song: TierListSong
  onDragStart: (e: DragEvent, songId: string) => void
  onDragOverTile: (e: DragEvent) => void
  onDropOnTile: (e: DragEvent, beforeSongId: string) => void
}) {
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
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDragOverTile(e)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDropOnTile(e, song.id)
      }}
      title={`${song.title} — ${song.artist}. Click to listen on SoundCloud, drag to rank.`}
      className="group relative h-24 w-24 shrink-0 cursor-grab overflow-hidden rounded-lg border border-arena-600 bg-arena-700 active:cursor-grabbing"
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

export default function TierListPresent() {
  const { tierListId } = useParams()
  const [list, setList] = useState<TierList | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

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

  function drop(targetTierId: string | null, beforeSongId: string | null) {
    if (!list || !draggingId) return
    persist(moveSong(list, draggingId, targetTierId, beforeSongId))
    setDraggingId(null)
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
              <div
                key={tier.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  drop(tier.id, null)
                }}
                className="flex overflow-hidden rounded-xl border border-arena-600"
              >
                <div
                  className="flex w-16 shrink-0 items-center justify-center px-2 text-center font-display text-xl text-arena-950 sm:w-20 sm:text-2xl"
                  style={{ background: tier.color }}
                >
                  {tier.name}
                </div>
                <div className="flex min-h-[6.5rem] flex-1 flex-wrap items-start gap-2 bg-arena-800/60 p-2">
                  {tierSongs.length === 0 && <div className="flex items-center px-2 text-xs text-slate-600">Drop songs here</div>}
                  {tierSongs.map((song) => (
                    <SongTile
                      key={song.id}
                      song={song}
                      onDragStart={handleDragStart}
                      onDragOverTile={() => {}}
                      onDropOnTile={(_e, beforeSongId) => drop(tier.id, beforeSongId)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              drop(null, null)
            }}
            className="rounded-xl border border-dashed border-arena-600 bg-arena-900/40 p-3"
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
                  onDragStart={handleDragStart}
                  onDragOverTile={() => {}}
                  onDropOnTile={(_e, beforeSongId) => drop(null, beforeSongId)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
