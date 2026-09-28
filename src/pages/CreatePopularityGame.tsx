import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSpotify } from '../state/SpotifyContext'
import {
  searchSpotifyArtists,
  getArtistTopTracks,
  getArtistCatalog,
  type SpotifyArtistMatch,
  type ImportableSpotifyTrack,
} from '../lib/spotify/spotify-tracks'
import { SpotifyApiError, SpotifyNotConnectedError, SpotifyRateLimitError } from '../lib/spotify/spotify-api'
import { savePopularityGame } from '../lib/storage/popularity-repository'
import { trackFromImportable, createInitialProgress, type PopularityGame, type PopularityRank } from '../types/popularity'
import { createTeam, teamColorForIndex, TEAM_COLORS, type Team } from '../types'
import SpotifyConnectPanel from '../components/SpotifyConnectPanel'
import Spinner from '../components/Spinner'
import TextInput from '../components/ui/TextInput'
import Button from '../components/ui/Button'
import Panel from '../components/ui/Panel'

function errorMessage(err: unknown): string {
  if (err instanceof SpotifyNotConnectedError) return 'Connect Spotify to search artists.'
  if (err instanceof SpotifyRateLimitError) return err.message
  if (err instanceof SpotifyApiError) return err.message
  return err instanceof Error ? err.message : 'Something went wrong talking to Spotify.'
}

// One page start to finish (search artist → confirm top 10 → set teams → save) rather than
// TierList's two-step Create-then-Builder split — there's no per-song editing here, so a
// separate builder page would just be an extra click for nothing to actually edit.
export default function CreatePopularityGame() {
  const navigate = useNavigate()
  const { connection } = useSpotify()

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [artistResults, setArtistResults] = useState<SpotifyArtistMatch[]>([])

  const [artist, setArtist] = useState<SpotifyArtistMatch | null>(null)
  const [loadingArtist, setLoadingArtist] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [topTracks, setTopTracks] = useState<ImportableSpotifyTrack[]>([])
  const [catalogPool, setCatalogPool] = useState<ImportableSpotifyTrack[]>([])

  const [name, setName] = useState('')
  const [teams, setTeams] = useState<Team[]>([createTeam('Team 1', TEAM_COLORS[0]), createTeam('Team 2', TEAM_COLORS[1])])
  const [saving, setSaving] = useState(false)

  async function runSearch(e: FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      setArtistResults(await searchSpotifyArtists(query))
    } catch (err) {
      setSearchError(errorMessage(err))
    } finally {
      setSearching(false)
    }
  }

  async function pickArtist(picked: SpotifyArtistMatch) {
    setArtist(picked)
    setLoadingArtist(true)
    setLoadError(null)
    try {
      const top = await getArtistTopTracks(picked.id)
      setTopTracks(top)
      setName(`Guess the Popularity — ${picked.name}`)
      // Pool building can run after the top-10 preview is already visible — no need to
      // block the page on it, and it's the slower of the two calls (more pages).
      getArtistCatalog(picked.name, top)
        .then(setCatalogPool)
        .catch(() => setCatalogPool(top)) // decoys are a nice-to-have; the real answers alone still make a playable pool
    } catch (err) {
      // `artist` stays set here (not reset to null) — the loadError branch below only
      // renders while `artist` is truthy, so clearing it would silently drop back to the
      // search results with no error shown at all, indistinguishable from the click having
      // done nothing.
      setLoadError(errorMessage(err))
    } finally {
      setLoadingArtist(false)
    }
  }

  function backToSearch() {
    setArtist(null)
    setTopTracks([])
    setCatalogPool([])
    setLoadError(null)
  }

  function addTeam() {
    setTeams((prev) => [...prev, createTeam(`Team ${prev.length + 1}`, teamColorForIndex(prev.length))])
  }

  function removeTeam(id: string) {
    setTeams((prev) => (prev.length <= 2 ? prev : prev.filter((t) => t.id !== id)))
  }

  function renameTeam(id: string, teamName: string) {
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name: teamName } : t)))
  }

  function recolorTeam(id: string, color: string) {
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, color } : t)))
  }

  function handleStart(e: FormEvent) {
    e.preventDefault()
    if (!artist || topTracks.length === 0 || saving) return
    setSaving(true)

    const ranks: PopularityRank[] = topTracks.map((t, i) => ({ rank: i + 1, track: trackFromImportable(t) }))
    const pool = (catalogPool.length > 0 ? catalogPool : topTracks).map(trackFromImportable)

    const now = new Date().toISOString()
    const game: PopularityGame = {
      id: crypto.randomUUID(),
      name: name.trim() || `Guess the Popularity — ${artist.name}`,
      artistId: artist.id,
      artistName: artist.name,
      artistImageUrl: artist.imageUrl,
      ranks,
      autocompletePool: pool,
      teams,
      createdAt: now,
      updatedAt: now,
      progress: createInitialProgress(),
    }
    const saved = savePopularityGame(game)
    navigate(`/popularity/${saved.id}/present`)
  }

  return (
    <div className="min-h-svh court-lines px-6 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="text-center">
          <div className="mb-2 text-4xl">📈</div>
          <h1 className="font-display text-4xl tracking-wide text-white">GUESS THE POPULARITY</h1>
          <p className="mt-2 text-sm text-slate-400">Pick an artist, then guess which song holds each of their top 10 spots.</p>
        </div>

        {!connection ? (
          <SpotifyConnectPanel />
        ) : !artist ? (
          <div className="space-y-4">
            <form onSubmit={runSearch} className="flex gap-2">
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for an artist…"
                autoFocus
                inputSize="lg"
                className="flex-1"
              />
              <Button size="lg" disabled={searching}>
                {searching ? 'Searching…' : 'Search'}
              </Button>
            </form>

            {searchError && <div className="rounded-lg bg-scoreboard-500/10 px-4 py-2 text-sm text-scoreboard-500">{searchError}</div>}

            {searching ? (
              <div className="flex justify-center py-8 text-slate-400">
                <Spinner className="h-8 w-8" />
              </div>
            ) : artistResults.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {artistResults.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => void pickArtist(a)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-arena-600 bg-arena-800 p-4 text-center hover:border-hardwood-500"
                  >
                    <div className="h-16 w-16 overflow-hidden rounded-full bg-arena-700">
                      {a.imageUrl ? (
                        <img src={a.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl text-arena-500">♪</div>
                      )}
                    </div>
                    <div className="truncate text-sm font-semibold text-slate-100">{a.name}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : loadingArtist ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
            <Spinner className="h-8 w-8" />
            <span>Loading {artist.name}'s top tracks…</span>
          </div>
        ) : loadError ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-scoreboard-500/10 px-4 py-2 text-sm text-scoreboard-500">{loadError}</div>
            <button onClick={backToSearch} className="text-sm text-slate-400 hover:text-slate-200">
              ← Back to search
            </button>
          </div>
        ) : (
          <form onSubmit={handleStart} className="space-y-8">
            <button type="button" onClick={backToSearch} className="text-sm text-slate-400 hover:text-slate-200">
              ← Choose a different artist
            </button>

            <Panel className="flex items-center gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-arena-700">
                {artist.imageUrl ? (
                  <img src={artist.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl text-arena-500">♪</div>
                )}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Artist</div>
                <div className="font-semibold text-slate-100">{artist.name}</div>
                <div className="text-xs text-slate-500">
                  Top {topTracks.length} track{topTracks.length === 1 ? '' : 's'} loaded
                  {catalogPool.length > 0 ? ` · ${catalogPool.length}-song guess pool` : ' · building guess pool…'}
                </div>
              </div>
            </Panel>

            {topTracks.length < 10 && (
              <p className="text-xs text-scoreboard-amber">
                Spotify only returned {topTracks.length} track{topTracks.length === 1 ? '' : 's'} for {artist.name} — the board will
                have {topTracks.length} rank{topTracks.length === 1 ? '' : 's'} instead of 10.
              </p>
            )}

            <div>
              <label className="mb-1 block text-sm text-slate-400">Game name</label>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} inputSize="lg" className="w-full" />
            </div>

            <div>
              <div className="mb-2 text-sm text-slate-400">Teams</div>
              <div className="space-y-2">
                {teams.map((team, i) => (
                  <div key={team.id} className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {TEAM_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => recolorTeam(team.id, color)}
                          className={`h-6 w-6 shrink-0 rounded-full ${team.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-arena-950' : ''}`}
                          style={{ background: color }}
                          aria-label={`Team ${i + 1} color`}
                        />
                      ))}
                    </div>
                    <TextInput value={team.name} onChange={(e) => renameTeam(team.id, e.target.value)} className="flex-1" />
                    {teams.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeTeam(team.id)}
                        className="shrink-0 rounded-lg px-2 text-slate-500 hover:text-scoreboard-500"
                        aria-label={`Remove ${team.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addTeam} className="mt-2 text-sm text-hardwood-400 hover:text-hardwood-300">
                + Add team
              </button>
            </div>

            <Button type="submit" fullWidth size="lg" disabled={saving}>
              START GAME →
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
