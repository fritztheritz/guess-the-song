import { useMemo, useState } from 'react'
import type { DraftPoolSong, Drafter } from '../types/draft'
import EmptyState from './ui/EmptyState'

type View = 'list' | 'grid'
type Sort = 'added' | 'title' | 'artist'

const PREFS_KEY = 'gts.draft.pickPrefs.v1'

interface Prefs {
  view: View
  sort: Sort
  quick: boolean
}

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>
    return { view: raw.view === 'grid' ? 'grid' : 'list', sort: raw.sort ?? 'added', quick: !!raw.quick }
  } catch {
    return { view: 'list', sort: 'added', quick: false }
  }
}

function Thumb({ song, size }: { song: DraftPoolSong; size: string }) {
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-md bg-arena-700`}>
      {song.artworkUrl ? (
        <img src={song.artworkUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-lg text-arena-500">♪</div>
      )}
    </div>
  )
}

// The pick screen's song list. Compact rows by default (a grid is one toggle away), sortable and
// searchable with a live count, and a tap only *selects* a song — a pinned bar then asks to draft
// it, so a mis-tap on a phone costs nothing. "Quick picks" turns that confirmation off.
export default function DraftPickPool({
  songs,
  totalAvailable,
  drafter,
  onPick,
}: {
  songs: DraftPoolSong[]
  totalAvailable: number
  drafter: Drafter
  onPick: (song: DraftPoolSong) => void
}) {
  const [prefs, setPrefs] = useState(readPrefs)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next))
    } catch {
      // Best-effort only.
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? songs.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(q)) : songs
    if (prefs.sort === 'added') return filtered
    const key = prefs.sort
    return [...filtered].sort((a, b) => a[key].localeCompare(b[key], undefined, { sensitivity: 'base' }) || a.title.localeCompare(b.title))
  }, [songs, query, prefs.sort])

  const selected = selectedId ? songs.find((s) => s.id === selectedId) : undefined

  function choose(song: DraftPoolSong) {
    if (prefs.quick) {
      onPick(song)
      return
    }
    setSelectedId(selectedId === song.id ? null : song.id)
  }

  function confirm() {
    if (!selected) return
    setSelectedId(null)
    onPick(selected)
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title or artist…"
            aria-label="Filter songs"
            className="w-full rounded-lg border border-arena-600 bg-arena-800 py-2 pl-3 pr-9 text-slate-100 outline-none focus:border-hardwood-500"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear filter" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              ✕
            </button>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          Sort
          <select
            value={prefs.sort}
            onChange={(e) => update({ sort: e.target.value as Sort })}
            className="rounded-lg border border-arena-600 bg-arena-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-hardwood-500"
          >
            <option value="added">Added</option>
            <option value="title">Title A–Z</option>
            <option value="artist">Artist A–Z</option>
          </select>
        </label>
        <div className="flex overflow-hidden rounded-lg border border-arena-600 text-xs" role="group" aria-label="View">
          {(['list', 'grid'] as const).map((v) => (
            <button
              key={v}
              onClick={() => update({ view: v })}
              aria-pressed={prefs.view === v}
              className={`px-3 py-1.5 capitalize ${prefs.view === v ? 'bg-hardwood-500 text-arena-950' : 'text-slate-300 hover:bg-arena-700'}`}
            >
              {v}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400" title="Skip the confirm step — one tap drafts the song">
          <input type="checkbox" checked={prefs.quick} onChange={(e) => update({ quick: e.target.checked })} className="h-3.5 w-3.5 accent-hardwood-500" />
          Quick picks
        </label>
      </div>

      <div className="mb-2 text-xs text-slate-500" role="status">
        {query ? `${visible.length} of ${totalAvailable} songs match` : `${totalAvailable} songs available`}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="🔎">No songs left matching "{query}".</EmptyState>
      ) : prefs.view === 'list' ? (
        <ul className="divide-y divide-arena-700 overflow-hidden rounded-xl border border-arena-700">
          {visible.map((song) => (
            <li key={song.id}>
              <button
                onClick={() => choose(song)}
                aria-pressed={selectedId === song.id}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-arena-800 ${selectedId === song.id ? 'bg-hardwood-500/15' : ''}`}
              >
                <Thumb song={song} size="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-100">{song.title}</div>
                  <div className="truncate text-xs text-slate-400">{song.artist}</div>
                </div>
                {(song.soundcloudUrl || song.spotifyUrl) && (
                  <a
                    href={song.soundcloudUrl || song.spotifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-xs text-hardwood-400 hover:text-hardwood-300"
                  >
                    Listen ↗
                  </a>
                )}
                {selectedId === song.id && <span className="shrink-0 text-hardwood-400">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {visible.map((song) => (
            <button
              key={song.id}
              onClick={() => choose(song)}
              aria-pressed={selectedId === song.id}
              className={`flex flex-col overflow-hidden rounded-xl border bg-arena-800 text-left hover:border-hardwood-500 ${
                selectedId === song.id ? 'border-hardwood-500 ring-2 ring-hardwood-500/40' : 'border-arena-600'
              }`}
            >
              <div className="aspect-square w-full bg-arena-700">
                {song.artworkUrl ? (
                  <img src={song.artworkUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl text-arena-500">♪</div>
                )}
              </div>
              <div className="p-2.5">
                <div className="truncate text-sm font-semibold text-slate-100">{song.title}</div>
                <div className="truncate text-xs text-slate-400">{song.artist}</div>
                {(song.soundcloudUrl || song.spotifyUrl) && (
                  <a
                    href={song.soundcloudUrl || song.spotifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-block text-xs text-hardwood-400 hover:text-hardwood-300"
                  >
                    Listen ↗
                  </a>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="sticky bottom-3 z-20 mt-4 flex items-center gap-3 rounded-xl border border-hardwood-500 bg-arena-900/95 px-4 py-3 shadow-2xl shadow-black/60 backdrop-blur">
          <Thumb song={selected} size="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-100">{selected.title}</div>
            <div className="truncate text-xs text-slate-400">{selected.artist}</div>
          </div>
          <button onClick={() => setSelectedId(null)} className="shrink-0 text-xs text-slate-400 hover:text-slate-200">
            Cancel
          </button>
          <button
            onClick={confirm}
            className="shrink-0 rounded-full bg-hardwood-500 px-4 py-2 text-sm font-semibold text-arena-950 hover:bg-hardwood-400"
          >
            Draft for {drafter.name}
          </button>
        </div>
      )}
    </div>
  )
}
