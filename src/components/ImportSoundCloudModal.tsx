import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import TrackCard from './TrackCard'
import SoundCloudConnectPanel from './SoundCloudConnectPanel'
import SoundCloudAttribution from './SoundCloudAttribution'
import Spinner from './Spinner'
import { useSoundCloud } from '../state/SoundCloudContext'
import {
  getLikedTracks,
  getMyTracks,
  getNextTrackPage,
  getPlaylists,
  getPlaylistTracks,
  getUserTracks,
  resolveSoundCloudUrl,
  searchTracks,
  searchUsers,
  type ImportableArtist,
  type ImportableTrack,
  type TrackPage,
} from '../lib/soundcloud/soundcloud-tracks'
import { getTrackPlayback } from '../lib/soundcloud/soundcloud-playback'
import { SoundCloudApiError, SoundCloudNotConnectedError, SoundCloudRateLimitError } from '../lib/soundcloud/soundcloud-api'
import { TrackNotPlayableError } from '../lib/soundcloud/soundcloud-playback'

type Tab = 'mine' | 'liked' | 'playlists' | 'search' | 'paste'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'mine', label: 'My Tracks' },
  { id: 'liked', label: 'Liked Tracks' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'search', label: 'Search' },
  { id: 'paste', label: 'Paste Link' },
]

interface Playlist {
  id: string
  title: string
  artworkUrl?: string
  trackCount: number
}

function errorMessage(err: unknown): string {
  if (err instanceof SoundCloudNotConnectedError) return 'Connect SoundCloud to import tracks.'
  if (err instanceof SoundCloudRateLimitError) return err.message
  if (err instanceof SoundCloudApiError) return err.message
  return err instanceof Error ? err.message : 'Something went wrong talking to SoundCloud.'
}

export default function ImportSoundCloudModal({
  onClose,
  onImport,
}: {
  onClose: () => void
  onImport: (tracks: ImportableTrack[]) => void
}) {
  const { connection } = useSoundCloud()
  const [tab, setTab] = useState<Tab>('mine')
  const [tracks, setTracks] = useState<ImportableTrack[]>([])
  const [nextHref, setNextHref] = useState<string | undefined>(undefined)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Map<string, ImportableTrack>>(new Map())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResolvedTrack, setSearchResolvedTrack] = useState<ImportableTrack | null>(null)
  const [artists, setArtists] = useState<ImportableArtist[]>([])
  const [activeArtist, setActiveArtist] = useState<ImportableArtist | null>(null)
  const [pasteUrl, setPasteUrl] = useState('')
  const [resolvedTrack, setResolvedTrack] = useState<ImportableTrack | null>(null)
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    audioRef.current = new Audio()
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  useEffect(() => {
    if (!connection) return
    setError(null)
    setFilterQuery('')
    if (tab === 'mine') void loadAll(getMyTracks)
    if (tab === 'liked') void loadAll(getLikedTracks)
    if (tab === 'playlists') void loadPlaylists()
    // search & paste are user-driven, no auto-load
  }, [tab, connection])

  async function load(fn: () => Promise<TrackPage>) {
    setLoading(true)
    setError(null)
    try {
      const page = await fn()
      setTracks(page.tracks)
      setNextHref(page.nextHref)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // "My Tracks" / "Liked Tracks" are your own library, not open-ended search results — the
  // filter box only searches what's loaded, so it needs the whole library up front rather
  // than requiring a manual "Load more" before a track becomes findable. Capped at 10 pages
  // (~500 tracks) so someone with a huge library doesn't trigger an unbounded fetch loop;
  // "Load more" still appears as a manual fallback past that cap.
  const AUTO_LOAD_PAGE_CAP = 10

  async function loadAll(fn: () => Promise<TrackPage>) {
    setLoading(true)
    setError(null)
    setTracks([])
    try {
      let page = await fn()
      setTracks(page.tracks)
      let pages = 1
      while (page.nextHref && pages < AUTO_LOAD_PAGE_CAP) {
        page = await getNextTrackPage(page.nextHref)
        setTracks((prev) => [...prev, ...page.tracks])
        pages++
      }
      setNextHref(page.nextHref)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (!nextHref) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await getNextTrackPage(nextHref)
      setTracks((prev) => [...prev, ...page.tracks])
      setNextHref(page.nextHref)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  async function loadPlaylists() {
    setLoading(true)
    setError(null)
    try {
      setPlaylists(await getPlaylists())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function openPlaylist(playlist: Playlist) {
    setActivePlaylist(playlist)
    setFilterQuery('')
    setLoading(true)
    setError(null)
    try {
      setTracks(await getPlaylistTracks(playlist.id))
      setNextHref(undefined)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Pasting from SoundCloud's mobile share sheet often copies more than the bare link —
  // e.g. "Track Name by Artist\nhttps://soundcloud.com/artist/track" — so this pulls just
  // the URL out of whatever was pasted rather than assuming the whole field is a clean URL.
  // Handles a link with no scheme too ("soundcloud.com/..." or "on.soundcloud.com/...").
  function extractSoundCloudUrl(value: string): string | null {
    const stripTrailingPunctuation = (s: string) => s.replace(/[.,;:!?)\]]+$/, '')
    const withScheme = value.match(/https?:\/\/\S+/i)
    if (withScheme) return stripTrailingPunctuation(withScheme[0])
    const bare = value.match(/(?:[\w-]+\.)?soundcloud\.com\/\S+/i)
    if (bare) return `https://${stripTrailingPunctuation(bare[0])}`
    return null
  }

  async function runSearch(e: FormEvent) {
    e.preventDefault()
    const query = searchQuery.trim()
    if (!query) return

    setActiveArtist(null)
    setArtists([])
    setSearchResolvedTrack(null)

    // A pasted link isn't a keyword — running it through /tracks?q= returns nothing useful.
    // Resolve it directly instead, same as the dedicated Paste Link tab.
    const url = extractSoundCloudUrl(query)
    if (url) {
      setLoading(true)
      setError(null)
      setTracks([])
      try {
        setSearchResolvedTrack(await resolveSoundCloudUrl(url))
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setLoading(false)
      }
      return
    }

    await load(() => searchTracks(query))
    // SoundCloud's track search only matches title/tags, not the uploader's name — search
    // users separately so searching an artist by name still finds their tracks. Best-effort:
    // an error here shouldn't block the track results that already loaded above.
    try {
      setArtists(await searchUsers(query))
    } catch {
      setArtists([])
    }
  }

  async function openArtist(artist: ImportableArtist) {
    setActiveArtist(artist)
    setFilterQuery('')
    await load(() => getUserTracks(artist.id))
  }

  async function backToSearchResults() {
    setActiveArtist(null)
    await load(() => searchTracks(searchQuery))
  }

  async function runResolve(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResolvedTrack(null)
    // Falls back to the raw trimmed input if nothing URL-shaped was found in it, rather
    // than blocking outright — resolveSoundCloudUrl will just surface a clear error.
    const url = extractSoundCloudUrl(pasteUrl.trim()) ?? pasteUrl.trim()
    try {
      setResolvedTrack(await resolveSoundCloudUrl(url))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function togglePreview(track: ImportableTrack) {
    const audio = audioRef.current
    if (!audio) return
    if (previewingId === track.soundcloudTrackId) {
      audio.pause()
      setPreviewingId(null)
      return
    }
    try {
      const url = await getTrackPlayback(track.soundcloudTrackId, track.soundcloudSecretToken)
      audio.src = url
      audio.currentTime = 0
      await audio.play()
      setPreviewingId(track.soundcloudTrackId)
      audio.onended = () => setPreviewingId(null)
    } catch (err) {
      setError(err instanceof TrackNotPlayableError ? err.message : errorMessage(err))
    }
  }

  function toggleSelect(track: ImportableTrack) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(track.soundcloudTrackId)) next.delete(track.soundcloudTrackId)
      else next.set(track.soundcloudTrackId, track)
      return next
    })
  }

  const selectedList = useMemo(() => Array.from(selected.values()), [selected])

  const filteredTracks = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return tracks
    return tracks.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
  }, [tracks, filterQuery])

  const allFilteredSelected = filteredTracks.length > 0 && filteredTracks.every((t) => selected.has(t.soundcloudTrackId))

  function toggleSelectAllFiltered() {
    setSelected((prev) => {
      const next = new Map(prev)
      if (allFilteredSelected) {
        filteredTracks.forEach((t) => next.delete(t.soundcloudTrackId))
      } else {
        filteredTracks.forEach((t) => next.set(t.soundcloudTrackId, t))
      }
      return next
    })
  }

  const showsFilterBox = tab === 'mine' || tab === 'liked' || (tab === 'playlists' && activePlaylist)

  function handleImportSelected() {
    onImport(selectedList)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-arena-600 bg-arena-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-arena-700 px-6 py-4">
          <div>
            <h2 className="font-display text-3xl tracking-wide text-hardwood-400">IMPORT FROM SOUNDCLOUD</h2>
            <p className="text-sm text-slate-400">Choose tracks from your SoundCloud library to build this game.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-arena-700 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="border-b border-arena-700 px-6 py-3">
          <SoundCloudConnectPanel />
        </div>

        {connection && (
          <>
            <div className="flex gap-1 border-b border-arena-700 px-6 pt-2">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTab(t.id)
                    setActivePlaylist(null)
                    setActiveArtist(null)
                    setArtists([])
                    setSearchResolvedTrack(null)
                    setError(null)
                  }}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
                    tab === t.id ? 'bg-arena-800 text-hardwood-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {error && <div className="mb-4 rounded-lg bg-scoreboard-500/10 px-4 py-2 text-sm text-scoreboard-500">{error}</div>}

              {tab === 'search' && (
                <>
                  <form onSubmit={runSearch} className="mb-4 flex gap-2">
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by title, artist, or paste a SoundCloud link…"
                      className="flex-1 rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-slate-100 outline-none focus:border-hardwood-500"
                    />
                    <button className="rounded-lg bg-hardwood-500 px-4 py-2 font-medium text-arena-950 hover:bg-hardwood-400">Search</button>
                  </form>

                  {searchResolvedTrack && (
                    <div className="mx-auto mb-4 max-w-md rounded-xl border border-arena-600 bg-arena-800 p-4 text-center">
                      {searchResolvedTrack.access === 'blocked' ? (
                        <>
                          <p className="font-medium text-slate-200">TRACK FOUND</p>
                          <p className="mt-1 text-sm text-slate-400">
                            This track is not available for playback through your current SoundCloud authorization.
                            You can still view the available metadata.
                          </p>
                        </>
                      ) : (
                        <p className="mb-2 font-medium text-teal-400">TRACK FOUND ✓</p>
                      )}
                      <div className="mx-auto max-w-[220px]">
                        <TrackCard
                          track={searchResolvedTrack}
                          onPreview={() => togglePreview(searchResolvedTrack)}
                          isPreviewing={previewingId === searchResolvedTrack.soundcloudTrackId}
                        />
                      </div>
                      <button
                        onClick={() => {
                          onImport([searchResolvedTrack])
                          onClose()
                        }}
                        className="mt-3 rounded-lg bg-hardwood-500 px-6 py-2 font-semibold text-arena-950 hover:bg-hardwood-400"
                      >
                        ADD TO GAME
                      </button>
                    </div>
                  )}

                  {activeArtist ? (
                    <button onClick={backToSearchResults} className="mb-3 text-sm text-slate-400 hover:text-slate-200">
                      ← Back to search results
                    </button>
                  ) : (
                    artists.length > 0 &&
                    !searchResolvedTrack && (
                      <div className="mb-4">
                        <div className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-500">Artists</div>
                        <div className="flex flex-wrap gap-2">
                          {artists.map((artist) => (
                            <button
                              key={artist.id}
                              onClick={() => openArtist(artist)}
                              className="flex items-center gap-2 rounded-full border border-arena-600 bg-arena-800 py-1 pl-1 pr-3 text-sm text-slate-200 hover:border-hardwood-500"
                            >
                              <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-arena-700 text-xs text-arena-500">
                                {artist.avatarUrl ? <img src={artist.avatarUrl} alt="" className="h-full w-full object-cover" /> : '♪'}
                              </span>
                              {artist.username}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </>
              )}

              {tab === 'paste' && (
                <div className="mx-auto max-w-md space-y-4">
                  <form onSubmit={runResolve} className="flex flex-col gap-2">
                    <label className="text-sm text-slate-400">Paste a SoundCloud link</label>
                    <input
                      value={pasteUrl}
                      onChange={(e) => setPasteUrl(e.target.value)}
                      placeholder="https://soundcloud.com/…"
                      className="rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-slate-100 outline-none focus:border-hardwood-500"
                    />
                    <button className="rounded-lg bg-hardwood-500 py-2 font-semibold text-arena-950 hover:bg-hardwood-400">
                      IMPORT TRACK
                    </button>
                  </form>

                  {resolvedTrack && (
                    <div className="rounded-xl border border-arena-600 bg-arena-800 p-4 text-center">
                      {resolvedTrack.access === 'blocked' ? (
                        <>
                          <p className="font-medium text-slate-200">TRACK FOUND</p>
                          <p className="mt-1 text-sm text-slate-400">
                            This track is not available for playback through your current SoundCloud authorization.
                            You can still view the available metadata.
                          </p>
                        </>
                      ) : (
                        <p className="mb-2 font-medium text-teal-400">TRACK FOUND ✓</p>
                      )}
                      <div className="mx-auto max-w-[220px]">
                        <TrackCard track={resolvedTrack} onPreview={() => togglePreview(resolvedTrack)} isPreviewing={previewingId === resolvedTrack.soundcloudTrackId} />
                      </div>
                      <button
                        onClick={() => {
                          onImport([resolvedTrack])
                          onClose()
                        }}
                        className="mt-3 rounded-lg bg-hardwood-500 px-6 py-2 font-semibold text-arena-950 hover:bg-hardwood-400"
                      >
                        ADD TO GAME
                      </button>
                    </div>
                  )}
                </div>
              )}

              {tab === 'playlists' && !activePlaylist && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {playlists.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openPlaylist(p)}
                      className="flex flex-col overflow-hidden rounded-xl border border-arena-600 bg-arena-800 text-left hover:border-hardwood-500"
                    >
                      <div className="aspect-square w-full bg-arena-700">
                        {p.artworkUrl && <img src={p.artworkUrl} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="p-3">
                        <div className="truncate font-medium text-slate-100">{p.title}</div>
                        <div className="text-xs text-slate-400">{p.trackCount} tracks</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {(tab === 'mine' ||
                tab === 'liked' ||
                (tab === 'search' && !searchResolvedTrack) ||
                (tab === 'playlists' && activePlaylist)) && (
                <>
                  {tab === 'playlists' && activePlaylist && (
                    <button onClick={() => setActivePlaylist(null)} className="mb-3 text-sm text-slate-400 hover:text-slate-200">
                      ← Back to playlists
                    </button>
                  )}

                  {showsFilterBox && tracks.length > 0 && (
                    <input
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      placeholder="Filter by title or artist…"
                      className="mb-2 w-full rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-slate-100 outline-none focus:border-hardwood-500"
                    />
                  )}

                  {filteredTracks.length > 0 && (
                    <div className="mb-4 flex justify-end">
                      <button
                        onClick={toggleSelectAllFiltered}
                        className="text-sm text-hardwood-400 underline hover:text-hardwood-300"
                      >
                        {allFilteredSelected
                          ? `Deselect all ${filteredTracks.length}`
                          : `Select all ${filteredTracks.length}${filterQuery ? ' (filtered)' : ''}`}
                      </button>
                    </div>
                  )}

                  {loading && tracks.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
                      <Spinner className="h-8 w-8" />
                      <span>Loading…</span>
                    </div>
                  ) : tracks.length === 0 ? (
                    <div className="py-12 text-center text-slate-500">No tracks here yet.</div>
                  ) : filteredTracks.length === 0 ? (
                    <div className="py-12 text-center text-slate-500">No tracks match "{filterQuery}".</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {filteredTracks.map((track) => (
                        <TrackCard
                          key={track.soundcloudTrackId}
                          track={track}
                          selected={selected.has(track.soundcloudTrackId)}
                          onToggleSelect={() => toggleSelect(track)}
                          onPreview={() => togglePreview(track)}
                          isPreviewing={previewingId === track.soundcloudTrackId}
                        />
                      ))}
                    </div>
                  )}

                  {loading && tracks.length > 0 && (
                    <div className="py-3 text-center text-xs text-slate-500">Loading more of your library… ({tracks.length} so far)</div>
                  )}

                  {!loading && nextHref && (tab === 'mine' || tab === 'liked' || tab === 'search') && (
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="mx-auto mt-4 block rounded-full border border-arena-500 px-6 py-2 text-sm text-slate-300 hover:border-hardwood-500 disabled:opacity-50"
                    >
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-arena-700 px-6 py-3">
              <SoundCloudAttribution />
              <button
                disabled={selectedList.length === 0}
                onClick={handleImportSelected}
                className="rounded-full bg-hardwood-500 px-6 py-2.5 font-semibold text-arena-950 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-hardwood-400"
              >
                ADD {selectedList.length || ''} TRACK{selectedList.length === 1 ? '' : 'S'} TO GAME
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
