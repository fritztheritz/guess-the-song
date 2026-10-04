import { useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { applyTierPreset, createTierDef, MAX_TIERS, MIN_TIERS, TIER_PRESETS, type TierList, type TierListSong } from '../types/tierlist'
import { rankedCount, shuffleUnranked } from '../lib/tierlist-ranking'
import { getTierList, listTierLists, saveTierList } from '../lib/storage/tierlist-repository'
import { generatePlaceholderArtwork } from '../lib/placeholder-artwork'
import ImportSoundCloudModal from '../components/ImportSoundCloudModal'
import TagInput from '../components/TagInput'
import TextInput from '../components/ui/TextInput'
import Button from '../components/ui/Button'
import ButtonLink from '../components/ui/ButtonLink'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import TierColorPicker from '../components/TierColorPicker'
import BuilderSection from '../components/BuilderSection'
import { useConfirm } from '../state/confirm-context'
import { useToast } from '../state/toast-context'
import type { ImportableTrack } from '../lib/soundcloud/soundcloud-tracks'
import { useStoredEntity } from '../lib/use-stored-entity'

export default function TierListBuilder() {
  const { tierListId } = useParams()
  const [list, setList] = useStoredEntity(tierListId, getTierList)
  // Arriving straight from "Create" with nothing in the list yet: open the song picker right away.
  const location = useLocation()
  const [importOpen, setImportOpen] = useState(() => !!(location.state as { addSongs?: boolean } | null)?.addSongs && (list?.songs.length ?? 0) === 0)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'added' | 'title' | 'artist'>('added')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const confirm = useConfirm()
  const showToast = useToast()
  const tagSuggestions = useMemo(() => Array.from(new Set(listTierLists().flatMap((l) => l.tags ?? []))).sort(), [])

  function persist(next: TierList) {
    const saved = saveTierList(next)
    setList(saved)
    setSavedAt(saved.updatedAt)
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

  // Removing is instant but undoable — the toast restores the exact previous list.
  function removeSongs(ids: Set<string>, message: string) {
    if (!list) return
    const before = list
    persist({ ...list, songs: list.songs.filter((s) => !ids.has(s.id)) })
    showToast(message, { action: { label: 'Undo', onAction: () => persist(before) } })
  }

  async function removeAllSongs() {
    if (!list || list.songs.length === 0) return
    if (!(await confirm(`Remove all ${list.songs.length} songs from this tier list?`, { danger: true, confirmLabel: 'Remove all' }))) return
    removeSongs(new Set(list.songs.map((s) => s.id)), 'Removed every song')
  }

  function recolorTier(id: string, color: string) {
    if (!list) return
    persist({ ...list, tiers: list.tiers.map((t) => (t.id === id ? { ...t, color } : t)) })
  }

  function moveTier(id: string, delta: -1 | 1) {
    if (!list) return
    const i = list.tiers.findIndex((t) => t.id === id)
    const j = i + delta
    if (i === -1 || j < 0 || j >= list.tiers.length) return
    const tiers = [...list.tiers]
    ;[tiers[i], tiers[j]] = [tiers[j], tiers[i]]
    persist({ ...list, tiers })
  }

  async function choosePreset(names: string[]) {
    if (!list) return
    if (rankedCount(list) > 0 && !(await confirm('Switching tiers moves any songs in tiers that no longer exist back to Unranked.', { confirmLabel: 'Switch tiers' }))) return
    persist(applyTierPreset(list, names))
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

  function updateTags(tags: string[]) {
    if (!list) return
    persist({ ...list, tags })
  }

  if (!list) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <ErrorState message="That tier list couldn't be found.">
          <Link to="/" className="mt-2 inline-block text-xs text-slate-300 underline hover:text-white">
            ← Back home
          </Link>
        </ErrorState>
      </div>
    )
  }

  const ranked = rankedCount(list)
  const needle = query.trim().toLowerCase()
  const visibleSongs = list.songs
    .filter((s) => !needle || `${s.title} ${s.artist}`.toLowerCase().includes(needle))
    .sort((a, b) => (sort === 'added' ? 0 : (sort === 'title' ? a.title : a.artist).localeCompare(sort === 'title' ? b.title : b.artist)))

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
              aria-label="Tier list name"
              className="mt-1 w-full bg-transparent font-display text-3xl tracking-wide text-white outline-none focus:border-b focus:border-hardwood-500"
            />
            <div className="mt-1 text-xs text-slate-500">
              ✓ {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'All changes saved'}
            </div>
          </div>
          <ButtonLink to={`/tierlists/${list.id}/present`} variant="primary" className="shrink-0">
            {ranked > 0 ? 'KEEP RANKING →' : 'PRESENT →'}
          </ButtonLink>
        </div>

        <BuilderSection id="tl-tiers" title="Tiers" summary={list.tiers.map((t) => t.name).join(' · ')}>
          <div className="mb-3 flex flex-wrap gap-2">
            {TIER_PRESETS.map((preset) => {
              const active = preset.names.length === list.tiers.length && preset.names.every((n, i) => n === list.tiers[i].name)
              return (
                <button
                  key={preset.id}
                  onClick={() => choosePreset(preset.names)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    active ? 'border-hardwood-500 bg-hardwood-500/15 text-hardwood-400' : 'border-arena-500 text-slate-300 hover:border-hardwood-500 hover:text-hardwood-400'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
          <div className="mb-3 overflow-hidden rounded-xl border border-arena-600" aria-label="Tier preview">
            {list.tiers.map((tier) => (
              <div key={tier.id} className="flex items-stretch border-b border-arena-700 last:border-b-0">
                <div className="flex min-w-14 max-w-32 items-center justify-center px-3 py-1.5 text-center font-display text-lg leading-tight text-arena-950" style={{ background: tier.color }}>
                  {tier.name || '—'}
                </div>
                <div className="flex-1 bg-arena-800/60" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {list.tiers.map((tier, i) => (
              <div key={tier.id} className="flex items-center gap-2">
                <TierColorPicker color={tier.color} label={`${tier.name} colour`} onChange={(c) => recolorTier(tier.id, c)} />
                <TextInput value={tier.name} onChange={(e) => renameTier(tier.id, e.target.value)} className="w-full" />
                <button
                  onClick={() => moveTier(tier.id, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${tier.name} up`}
                  className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:text-white disabled:opacity-20"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveTier(tier.id, 1)}
                  disabled={i === list.tiers.length - 1}
                  aria-label={`Move ${tier.name} down`}
                  className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:text-white disabled:opacity-20"
                >
                  ↓
                </button>
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
        </BuilderSection>

        <BuilderSection id="tl-tags" title="Tags" summary={(list.tags ?? []).join(', ') || 'none'}>
          <div className="max-w-sm">
            <TagInput tags={list.tags ?? []} onChange={updateTags} suggestions={tagSuggestions} listId="tierlist-tag-suggestions" />
          </div>
        </BuilderSection>

        <section className="mt-6 border-t border-arena-700 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl tracking-wide text-slate-300">
              SONGS <span className="text-sm font-normal text-slate-500">({list.songs.length})</span>
            </h2>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              + Add Songs
            </Button>
          </div>

          {list.songs.length === 0 ? (
            <EmptyState
              icon="🎵"
              action={
                <Button size="sm" onClick={() => setImportOpen(true)}>
                  + Add songs from SoundCloud
                </Button>
              }
            >
              No songs yet — add some from SoundCloud to build your list.
            </EmptyState>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <TextInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search songs…"
                  aria-label="Search songs"
                  inputSize="sm"
                  className="min-w-40 flex-1"
                />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                  aria-label="Sort songs"
                  className="rounded-lg border border-arena-500 bg-arena-800 px-2 py-1.5 text-sm text-slate-200"
                >
                  <option value="added">Order added</option>
                  <option value="title">Title A–Z</option>
                  <option value="artist">Artist A–Z</option>
                </select>
                <Button variant="outline" size="sm" onClick={() => persist(shuffleUnranked(list))} title="Randomise the order unranked songs come up in">
                  🔀 Shuffle
                </Button>
                <Button variant="outline" size="sm" onClick={removeAllSongs} className="text-slate-400 hover:text-scoreboard-500">
                  Remove all
                </Button>
              </div>
              {ranked > 0 && (
                <p className="mb-3 text-xs text-slate-500">
                  {ranked} of {list.songs.length} already ranked — open Present to keep going, rankings are saved as you drag.
                </p>
              )}
              {visibleSongs.length === 0 ? (
                <EmptyState icon="🔎">No songs match “{query}”.</EmptyState>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {visibleSongs.map((song) => (
                    <div key={song.id} className="group relative overflow-hidden rounded-xl border border-arena-600 bg-arena-800">
                      <button
                        onClick={() => removeSongs(new Set([song.id]), `Removed “${song.title}”`)}
                        aria-label={`Remove ${song.title}`}
                        className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-xs text-white hover:bg-scoreboard-500 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      >
                        ✕
                      </button>
                      <div className="relative aspect-square w-full bg-arena-700">
                        {song.artworkUrl && <img src={song.artworkUrl} alt="" className="h-full w-full object-cover" />}
                        {(() => {
                          const tier = list.tiers.find((t) => t.id === song.tierId)
                          return tier ? (
                            <span className="absolute bottom-1 left-1 max-w-[80%] truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold text-arena-950" style={{ background: tier.color }}>
                              {tier.name}
                            </span>
                          ) : null
                        })()}
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
              )}
            </>
          )}
        </section>
      </div>

      {importOpen && <ImportSoundCloudModal onClose={() => setImportOpen(false)} onImport={handleImport} />}
    </div>
  )
}
