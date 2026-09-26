import { useEffect, useMemo, useState, type FormEvent } from 'react'
import SpotifyConnectPanel from './SpotifyConnectPanel'
import { useSpotify } from '../state/SpotifyContext'
import {
  searchSpotifyTracks,
  getArtistTopTracks,
  loadMoreSpotifyTracks,
  getMyPlaylists,
  getPlaylistTracksPage,
  type ImportableSpotifyTrack,
  type SpotifyArtistMatch,
  type SpotifyPlaylistSummary,
} from '../lib/spotify/spotify-tracks'
import { SpotifyApiError, SpotifyNotConnectedError, SpotifyPremiumRequiredError, SpotifyRateLimitError } from '../lib/spotify/spotify-api'

function errorMessage(err: unknown): string {
  if (err instanceof SpotifyNotConnectedError) return 'Connect Spotify to search tracks.'
  if (err instanceof SpotifyPremiumRequiredError) return err.message
  if (err instanceof SpotifyRateLimitError) return err.message
  if (err instanceof SpotifyApiError) return err.message
  return err instanceof Error ? err.message : 'Something went wrong talking to Spotify.'
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

type Tab = 'search' | 'playlists'

// Search and the host's own playlists — deliberately no "my tracks"/liked-tracks tabs and no
// per-track preview audition while browsing (unlike ImportSoundCloudModal): auditioning a
// track here would mean spinning up the full Web Playback SDK connection just to browse
// results, which is heavy and Premium-gated. Pick, add — the clip is set afterward in
// ClipEditor same as any other source, and actual playback only ever happens at that point
// or in-game.
export default function ImportSpotifyModal({
  onClose,
  onImport,
}: {
  onClose: () => void
  onImport: (tracks: ImportableSpotifyTrack[]) => void
}) {
  const { connection } = useSpotify()
  const [tab, setTab] = useState<Tab>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ImportableSpotifyTrack[]>([])
  const [total, setTotal] = useState(0)
  const [artistMatch, setArtistMatch] = useState<SpotifyArtistMatch | null>(null)
  const [viewingArtist, setViewingArtist] = useState<SpotifyArtistMatch | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Map<string, ImportableSpotifyTrack>>(new Map())

  const [playlists, setPlaylists] = useState<SpotifyPlaylistSummary[]>([])
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [activePlaylist, setActivePlaylist] = useState<SpotifyPlaylistSummary | null>(null)

  useEffect(() => {
    if (!connection || tab !== 'playlists' || playlists.length > 0) return
    setLoadingPlaylists(true)
    setError(null)
    getMyPlaylists()
      .then(setPlaylists)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoadingPlaylists(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, tab])

  async function performSearch() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setViewingArtist(null)
    try {
      const result = await searchSpotifyTracks(query)
      setResults(result.tracks)
      setTotal(result.total)
      setArtistMatch(result.artist)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function runSearch(e: FormEvent) {
    e.preventDefault()
    void performSearch()
  }

  async function viewArtistTopTracks(artist: SpotifyArtistMatch) {
    setLoading(true)
    setError(null)
    try {
      const tracks = await getArtistTopTracks(artist.id)
      setResults(tracks)
      setTotal(tracks.length) // no pagination on this endpoint — this is the whole list
      setViewingArtist(artist)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Same "load the next batch" shape whether the current results came from a keyword search
  // or from a playlist that's open — only which fetch function to call differs.
  async function handleLoadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const newTracks = activePlaylist
        ? (await getPlaylistTracksPage(activePlaylist.id, results.length)).tracks
        : await loadMoreSpotifyTracks(query, results.length)
      setResults((prev) => [...prev, ...newTracks])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  // TODO(human): implement openPlaylist(playlist: SpotifyPlaylistSummary).
  //
  // Called when the host clicks a playlist card. It should:
  //   1. Set loading state, clear any previous error, and set activePlaylist(playlist).
  //   2. Fetch this playlist's tracks via getPlaylistTracksPage(playlist.id, offset),
  //      starting at offset 0.
  //   3. Decide how many pages to eagerly auto-load before leaving the rest to the
  //      "Load more results" button (which already works once `results`/`total` are set —
  //      see handleLoadMore above). ImportSoundCloudModal's AUTO_LOAD_PAGE_CAP (10 pages,
  //      ~500 tracks at SoundCloud's ~50-per-page) is the precedent, but this app's Spotify
  //      quota caps out much lower per request (as low as 5) — a straight copy of "10 pages"
  //      would mean 10x as many round trips for a fraction of the tracks. Pick a cap that
  //      makes sense for that per-request size, or make the number of tracks (not pages)
  //      the cap instead.
  //   4. Call setResults(...) and setTotal(...) with what you've loaded, same as
  //      performSearch/viewArtistTopTracks do.
  //   5. Reset loading state in a finally, same pattern as the other handlers.
  async function openPlaylist(playlist: SpotifyPlaylistSummary) {
    setLoading(true)
    setError(null)
    setActivePlaylist(playlist)

    try {
      let tracks = await getPlaylistTracksPage(playlist.id, 0)
      setResults(tracks["tracks"])
      setTotal(tracks["total"])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function backToPlaylists() {
    setActivePlaylist(null)
    setResults([])
    setTotal(0)
    setError(null)
  }

  function switchTab(next: Tab) {
    setTab(next)
    setError(null)
    setActivePlaylist(null)
    setResults([])
    setTotal(0)
    setViewingArtist(null)
    setArtistMatch(null)
  }

  function toggleSelect(track: ImportableSpotifyTrack) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(track.spotifyTrackId)) next.delete(track.spotifyTrackId)
      else next.set(track.spotifyTrackId, track)
      return next
    })
  }

  const selectedList = useMemo(() => Array.from(selected.values()), [selected])

  function handleImportSelected() {
    onImport(selectedList)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-arena-600 bg-arena-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-arena-700 px-6 py-4">
          <div>
            <h2 className="font-display text-3xl tracking-wide text-hardwood-400">IMPORT FROM SPOTIFY</h2>
            <p className="text-sm text-slate-400">Search Spotify's catalog for tracks to build this game.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-arena-700 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="border-b border-arena-700 px-6 py-3">
          <SpotifyConnectPanel />
        </div>

        {connection && (
          <>
            <div className="flex gap-1 border-b border-arena-700 px-6 pt-2">
              {(['search', 'playlists'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
                    tab === t ? 'bg-arena-800 text-hardwood-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t === 'search' ? 'Search' : 'Playlists'}
                </button>
              ))}
            </div>

            {tab === 'search' && (
              <div className="px-6 pt-4">
                <form onSubmit={runSearch} className="flex gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by title or artist…"
                    autoFocus
                    className="flex-1 rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-slate-100 outline-none focus:border-hardwood-500"
                  />
                  <button className="rounded-lg bg-hardwood-500 px-4 py-2 font-medium text-arena-950 hover:bg-hardwood-400">Search</button>
                </form>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {error && <div className="mb-4 rounded-lg bg-scoreboard-500/10 px-4 py-2 text-sm text-scoreboard-500">{error}</div>}

              {tab === 'playlists' && !activePlaylist && (
                <>
                  {loadingPlaylists ? (
                    <div className="py-12 text-center text-slate-400">Loading playlists…</div>
                  ) : playlists.length === 0 ? (
                    <div className="py-12 text-center text-slate-500">No playlists found.</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {playlists.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => openPlaylist(p)}
                          className="flex flex-col overflow-hidden rounded-xl border border-arena-600 bg-arena-800 text-left hover:border-hardwood-500"
                        >
                          <div className="aspect-square w-full bg-arena-700">
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-3xl text-arena-500">♪</div>
                            )}
                          </div>
                          <div className="p-3">
                            <div className="truncate font-medium text-slate-100">{p.name}</div>
                            <div className="text-xs text-slate-400">{p.trackCount} tracks</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {tab === 'playlists' && activePlaylist && (
                <button onClick={backToPlaylists} className="mb-3 text-sm text-slate-400 hover:text-slate-200">
                  ← Back to playlists
                </button>
              )}

              {tab === 'search' &&
                (viewingArtist ? (
                  <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
                    <span>Top tracks by <span className="font-semibold text-slate-200">{viewingArtist.name}</span></span>
                    <button onClick={() => void performSearch()} className="text-hardwood-400 hover:underline">
                      ← back to "{query}"
                    </button>
                  </div>
                ) : (
                  artistMatch && (
                    <button
                      onClick={() => viewArtistTopTracks(artistMatch)}
                      className="mb-4 flex items-center gap-3 rounded-xl border border-arena-600 bg-arena-800 px-4 py-2.5 text-left hover:border-hardwood-500"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-arena-700">
                        {artistMatch.imageUrl ? (
                          <img src={artistMatch.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-lg text-arena-500">♪</div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-500">Artist</div>
                        <div className="font-semibold text-slate-100">{artistMatch.name}</div>
                      </div>
                      <span className="ml-auto text-xs text-hardwood-400">View top tracks →</span>
                    </button>
                  )
                ))}

              {(tab === 'search' || activePlaylist) && (loading ? (
                <div className="py-12 text-center text-slate-400">{activePlaylist ? 'Loading tracks…' : 'Searching…'}</div>
              ) : results.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  {activePlaylist ? 'This playlist has no tracks.' : query ? `No results for "${query}".` : 'Search for a song to get started.'}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {results.map((track) => {
                    const isSelected = selected.has(track.spotifyTrackId)
                    return (
                      <button
                        key={track.spotifyTrackId}
                        onClick={() => toggleSelect(track)}
                        className={`group relative flex flex-col overflow-hidden rounded-xl border bg-arena-800 text-left transition-colors ${
                          isSelected ? 'border-hardwood-500 ring-1 ring-hardwood-500' : 'border-arena-600 hover:border-arena-500'
                        }`}
                      >
                        <span
                          className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border text-sm ${
                            isSelected ? 'border-hardwood-500 bg-hardwood-500 text-arena-950' : 'border-white/40 bg-black/40 text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                        <div className="aspect-square w-full bg-arena-700">
                          {track.artworkUrl ? (
                            <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-3xl text-arena-500">♪</div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-1 p-3">
                          <div className="truncate font-semibold text-slate-100" title={track.title}>
                            {track.title}
                          </div>
                          <div className="truncate text-sm text-slate-400" title={track.artist}>
                            {track.artist}
                          </div>
                          <div className="text-xs text-slate-500">{formatDuration(track.duration)}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}

              {!viewingArtist && !loading && results.length > 0 && results.length < total && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => void handleLoadMore()}
                    disabled={loadingMore}
                    className="rounded-full border border-arena-600 px-5 py-2 text-sm text-slate-300 hover:border-hardwood-500 hover:text-hardwood-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loadingMore ? 'Loading…' : 'Load more results'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-arena-700 px-6 py-3">
              <span className="text-xs text-slate-500">Full-track playback requires the host's Spotify Premium account.</span>
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
