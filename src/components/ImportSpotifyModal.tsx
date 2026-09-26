import { useMemo, useState, type FormEvent } from 'react'
import SpotifyConnectPanel from './SpotifyConnectPanel'
import { useSpotify } from '../state/SpotifyContext'
import {
  searchSpotifyTracks,
  getArtistTopTracks,
  type ImportableSpotifyTrack,
  type SpotifyArtistMatch,
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

// Deliberately search-only (no "my tracks"/playlists tabs, no per-track preview audition
// while browsing) — unlike ImportSoundCloudModal, auditioning a track here would mean
// spinning up the full Web Playback SDK connection just to browse results, which is heavy
// and Premium-gated. Search, pick, add — the clip is set afterward in ClipEditor same as
// any other source, and actual playback only ever happens at that point or in-game.
export default function ImportSpotifyModal({
  onClose,
  onImport,
}: {
  onClose: () => void
  onImport: (tracks: ImportableSpotifyTrack[]) => void
}) {
  const { connection } = useSpotify()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ImportableSpotifyTrack[]>([])
  const [artistMatch, setArtistMatch] = useState<SpotifyArtistMatch | null>(null)
  const [viewingArtist, setViewingArtist] = useState<SpotifyArtistMatch | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Map<string, ImportableSpotifyTrack>>(new Map())

  async function performSearch() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setViewingArtist(null)
    try {
      const result = await searchSpotifyTracks(query)
      setResults(result.tracks)
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
      setResults(await getArtistTopTracks(artist.id))
      setViewingArtist(artist)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
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

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {error && <div className="mb-4 rounded-lg bg-scoreboard-500/10 px-4 py-2 text-sm text-scoreboard-500">{error}</div>}

              {viewingArtist ? (
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
              )}

              {loading ? (
                <div className="py-12 text-center text-slate-400">Searching…</div>
              ) : results.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  {query ? `No results for "${query}".` : 'Search for a song to get started.'}
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
