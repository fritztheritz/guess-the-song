import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { createTierDef, MAX_TIERS, MIN_TIERS, type TierList, type TierListSong } from '../types/tierlist'
import { getTierList, saveTierList } from '../lib/storage/tierlist-repository'
import { generatePlaceholderArtwork } from '../lib/placeholder-artwork'
import ImportSoundCloudModal from '../components/ImportSoundCloudModal'
import type { ImportableTrack } from '../lib/soundcloud/soundcloud-tracks'

export default function TierListBuilder() {
  const { tierListId } = useParams()
  const [list, setList] = useState<TierList | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    if (!tierListId) return
    setList(getTierList(tierListId))
  }, [tierListId])

  function persist(next: TierList) {
    setList(saveTierList(next))
  }

  function handleImport(tracks: ImportableTrack[]) {
    if (!list) return
    const existingIds = new Set(list.songs.map((s) => s.soundcloudTrackId))
    const pool = list.songs.filter((s) => s.tierId === null)
    let nextOrder = pool.length

    const newSongs: TierListSong[] = tracks
      .filter((t) => !existingIds.has(t.soundcloudTrackId))
      .map((t) => ({
        id: crypto.randomUUID(),
        soundcloudTrackId: t.soundcloudTrackId,
        soundcloudUrn: t.soundcloudUrn,
        soundcloudUrl: t.soundcloudUrl,
        soundcloudSecretToken: t.soundcloudSecretToken,
        title: t.title,
        artist: t.artist,
        artworkUrl: t.artworkUrl ?? generatePlaceholderArtwork(t.title),
        generatedArtwork: !t.artworkUrl,
        tierId: null,
        order: nextOrder++,
      }))

    persist({ ...list, songs: [...list.songs, ...newSongs] })
  }

  function removeSong(id: string) {
    if (!list) return
    persist({ ...list, songs: list.songs.filter((s) => s.id !== id) })
  }

  function renameTier(id: string, name: string) {
    if (!list) return
    persist({ ...list, tiers: list.tiers.map((t) => (t.id === id ? { ...t, name } : t)) })
  }

  function addTier() {
    if (!list || list.tiers.length >= MAX_TIERS) return
    persist({ ...list, tiers: [...list.tiers, createTierDef(`Tier ${list.tiers.length + 1}`, list.tiers.length)] })
  }

  function removeTier(id: string) {
    if (!list || list.tiers.length <= MIN_TIERS) return
    persist({
      ...list,
      tiers: list.tiers.filter((t) => t.id !== id),
      // Songs that were ranked in the removed tier fall back to unranked rather than vanishing.
      songs: list.songs.map((s) => (s.tierId === id ? { ...s, tierId: null, order: 0 } : s)),
    })
  }

  if (!list) {
    return (
      <div className="flex min-h-svh items-center justify-center text-slate-400">
        {tierListId ? 'Loading…' : 'Tier list not found.'}
      </div>
    )
  }

  const rankedCount = list.songs.filter((s) => s.tierId !== null).length

  return (
    <div className="min-h-svh court-lines">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Link to="/" className="text-sm text-slate-400 hover:text-hardwood-400">
              ← Home
            </Link>
            <input
              value={list.name}
              onChange={(e) => persist({ ...list, name: e.target.value })}
              className="mt-1 w-full bg-transparent font-display text-3xl tracking-wide text-white outline-none"
            />
          </div>
          <Link
            to={`/tierlists/${list.id}/present`}
            className="shrink-0 rounded-full bg-hardwood-500 px-6 py-2.5 font-semibold text-arena-950 hover:bg-hardwood-400"
          >
            PRESENT →
          </Link>
        </div>

        <section className="mb-8">
          <h2 className="mb-3 font-display text-xl tracking-wide text-slate-300">TIERS</h2>
          <div className="space-y-2">
            {list.tiers.map((tier) => (
              <div key={tier.id} className="flex items-center gap-2">
                <span className="h-6 w-6 shrink-0 rounded-md" style={{ background: tier.color }} />
                <input
                  value={tier.name}
                  onChange={(e) => renameTier(tier.id, e.target.value)}
                  className="w-full rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-slate-100 outline-none focus:border-hardwood-500"
                />
                {list.tiers.length > MIN_TIERS && (
                  <button
                    onClick={() => removeTier(tier.id)}
                    aria-label={`Remove ${tier.name} tier`}
                    className="shrink-0 rounded-lg px-2 py-1 text-slate-500 hover:text-scoreboard-500"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {list.tiers.length < MAX_TIERS && (
            <button
              onClick={addTier}
              className="mt-2 w-full rounded-lg border border-dashed border-arena-500 py-2 text-sm text-slate-400 hover:border-hardwood-500 hover:text-hardwood-400"
            >
              + Add Tier
            </button>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl tracking-wide text-slate-300">
              SONGS <span className="text-sm font-normal text-slate-500">({list.songs.length})</span>
            </h2>
            <button
              onClick={() => setImportOpen(true)}
              className="rounded-lg border border-arena-500 px-3 py-1.5 text-sm text-slate-200 hover:border-hardwood-500"
            >
              + Add Songs
            </button>
          </div>

          {list.songs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-arena-600 bg-arena-800/40 p-6 text-center text-sm text-slate-400">
              No songs yet — add some from SoundCloud to build your list.
            </div>
          ) : (
            <>
              {rankedCount > 0 && (
                <p className="mb-3 text-xs text-slate-500">
                  {rankedCount} of {list.songs.length} already ranked — open Present to keep going, rankings are saved as you drag.
                </p>
              )}
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {list.songs.map((song) => (
                  <div key={song.id} className="group relative overflow-hidden rounded-xl border border-arena-600 bg-arena-800">
                    <button
                      onClick={() => removeSong(song.id)}
                      aria-label={`Remove ${song.title}`}
                      className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white opacity-0 hover:bg-scoreboard-500 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                    <div className="aspect-square w-full bg-arena-700">
                      {song.artworkUrl && <img src={song.artworkUrl} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="p-2">
                      <div className="truncate text-xs font-medium text-slate-100" title={song.title}>
                        {song.title}
                      </div>
                      <div className="truncate text-[11px] text-slate-500" title={song.artist}>
                        {song.artist}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {importOpen && <ImportSoundCloudModal onClose={() => setImportOpen(false)} onImport={handleImport} />}
    </div>
  )
}
