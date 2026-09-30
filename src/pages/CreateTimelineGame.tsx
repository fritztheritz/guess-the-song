import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSpotify } from '../state/spotify-context'
import { searchSpotifyTracks, loadMoreSpotifyTracks, type ImportableSpotifyTrack } from '../lib/spotify/spotify-tracks'
import { SpotifyApiError, SpotifyNotConnectedError, SpotifyRateLimitError } from '../lib/spotify/spotify-api'
import { saveTimelineGame } from '../lib/storage/timeline-repository'
import { createInitialTimelineProgress, songFromImportable, type TimelineGame, type TimelineSong } from '../types/timeline'
import { createTeam, teamColorForIndex, TEAM_COLORS, type Team } from '../types'
import SpotifyConnectPanel from '../components/SpotifyConnectPanel'
import Spinner from '../components/Spinner'
import TextInput from '../components/ui/TextInput'
import Button from '../components/ui/Button'
import Panel from '../components/ui/Panel'

const MIN_SONGS = 8
const MAX_SONGS = 40
const TURN_TIMER_OPTIONS = [15, 30, 45, 60]
// Spotify's search supports a `year:` filter with a range — these just fill it in.
const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020]

function errorMessage(err: unknown): string {
  if (err instanceof SpotifyNotConnectedError) return 'Connect Spotify to search songs.'
  if (err instanceof SpotifyRateLimitError || err instanceof SpotifyApiError) return err.message
  return err instanceof Error ? err.message : 'Something went wrong talking to Spotify.'
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// One page start to finish (find songs → set teams → save), same shape as Guess the
// Popularity's setup. Songs are picked by hand rather than pulled from a playlist because
// the whole game hangs on each one's release year, and Spotify search results all carry it.
export default function CreateTimelineGame() {
  const navigate = useNavigate()
  const { connection } = useSpotify()

  const [query, setQuery] = useState('')
  const [decade, setDecade] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ImportableSpotifyTrack[]>([])
  const [total, setTotal] = useState(0)
  const [lastQuery, setLastQuery] = useState('')

  const [picked, setPicked] = useState<TimelineSong[]>([])
  const [name, setName] = useState('Guess the Timeline')
  const [teams, setTeams] = useState<Team[]>([createTeam('Team 1', TEAM_COLORS[0]), createTeam('Team 2', TEAM_COLORS[1])])
  const [turnTimer, setTurnTimer] = useState(0)

  const pickedIds = new Set(picked.map((s) => s.spotifyTrackId))

  function buildQuery(): string {
    const parts = [query.trim()]
    if (decade !== null) parts.push(`year:${decade}-${decade + 9}`)
    return parts.filter(Boolean).join(' ')
  }

  async function runSearch(e: FormEvent) {
    e.preventDefault()
    const q = buildQuery()
    if (!q) return
    setSearching(true)
    setError(null)
    try {
      const result = await searchSpotifyTracks(q)
      setResults(result.tracks)
      setTotal(result.total)
      setLastQuery(q)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSearching(false)
    }
  }

  async function loadMore() {
    setLoadingMore(true)
    setError(null)
    try {
      const more = await loadMoreSpotifyTracks(lastQuery, results.length)
      setResults((prev) => [...prev, ...more])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  function toggle(track: ImportableSpotifyTrack) {
    if (pickedIds.has(track.spotifyTrackId)) {
      setPicked((prev) => prev.filter((s) => s.spotifyTrackId !== track.spotifyTrackId))
      return
    }
    const song = songFromImportable(track)
    if (!song || picked.length >= MAX_SONGS) return
    setPicked((prev) => [...prev, song])
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
    if (picked.length < MIN_SONGS) return
    const deck = shuffled(picked)
    const now = new Date().toISOString()
    const game: TimelineGame = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Guess the Timeline',
      songs: deck,
      teams,
      turnTimerSeconds: turnTimer > 0 ? turnTimer : undefined,
      createdAt: now,
      updatedAt: now,
      progress: createInitialTimelineProgress(deck),
    }
    const saved = saveTimelineGame(game)
    navigate(`/timeline/${saved.id}/present`)
  }

  return (
    <div className="min-h-svh court-lines px-6 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="text-center">
          <div className="mb-2 text-4xl">🕰️</div>
          <h1 className="font-display text-4xl tracking-wide text-white">GUESS THE TIMELINE</h1>
          <p className="mt-2 text-sm text-slate-400">
            Build a deck of songs, then teams take turns slotting each mystery song into the right place by release year.
          </p>
        </div>

        {!connection ? (
          <SpotifyConnectPanel />
        ) : (
          <form onSubmit={handleStart} className="space-y-8">
            <div className="space-y-3">
              <div className="flex gap-2">
                <TextInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runSearch(e)
                  }}
                  placeholder="Search songs, artists, genres…"
                  inputSize="lg"
                  className="flex-1"
                />
                <Button type="button" size="lg" disabled={searching} onClick={(e) => void runSearch(e)}>
                  {searching ? 'Searching…' : 'Search'}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500">Decade:</span>
                {DECADES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDecade((cur) => (cur === d ? null : d))}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      decade === d ? 'border-hardwood-500 bg-hardwood-500/15 text-hardwood-300' : 'border-arena-600 text-slate-400 hover:border-arena-500'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
              {error && <div className="rounded-lg bg-scoreboard-500/10 px-4 py-2 text-sm text-scoreboard-500">{error}</div>}
            </div>

            {searching ? (
              <div className="flex justify-center py-6 text-slate-400">
                <Spinner className="h-8 w-8" />
              </div>
            ) : (
              results.length > 0 && (
                <div className="space-y-1.5">
                  {results.map((t) => {
                    const isPicked = pickedIds.has(t.spotifyTrackId)
                    const noYear = t.releaseYear === undefined
                    return (
                      <button
                        key={t.spotifyTrackId}
                        type="button"
                        disabled={noYear || (!isPicked && picked.length >= MAX_SONGS)}
                        onClick={() => toggle(t)}
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40 ${
                          isPicked ? 'border-hardwood-500 bg-hardwood-500/10' : 'border-arena-600 bg-arena-800 hover:border-arena-500'
                        }`}
                      >
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-arena-700">
                          {t.artworkUrl && <img src={t.artworkUrl} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-slate-100">{t.title}</div>
                          <div className="truncate text-xs text-slate-500">{t.artist}</div>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">{t.releaseYear ?? 'no year'}</span>
                        <span className="w-14 shrink-0 text-right text-xs font-semibold text-hardwood-400">{isPicked ? '✓ Added' : '+ Add'}</span>
                      </button>
                    )
                  })}
                  {results.length < total && (
                    <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="w-full py-2 text-sm text-hardwood-400 hover:text-hardwood-300">
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  )}
                </div>
              )
            )}

            <Panel className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-200">
                  Your deck · {picked.length} song{picked.length === 1 ? '' : 's'}
                </div>
                {picked.length > 0 && (
                  <button type="button" onClick={() => setPicked([])} className="text-xs text-slate-500 hover:text-scoreboard-500">
                    Clear
                  </button>
                )}
              </div>
              {picked.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Add at least {MIN_SONGS} songs (up to {MAX_SONGS}). Mix decades for an easier game, or stick to one for a hard one.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {picked.map((s) => (
                    <button
                      key={s.spotifyTrackId}
                      type="button"
                      onClick={() => setPicked((prev) => prev.filter((x) => x.spotifyTrackId !== s.spotifyTrackId))}
                      className="max-w-full truncate rounded-full border border-arena-600 px-2.5 py-1 text-xs text-slate-300 hover:border-scoreboard-500"
                      title="Remove"
                    >
                      {s.title} · {s.year} ✕
                    </button>
                  ))}
                </div>
              )}
              {picked.length > 0 && picked.length < MIN_SONGS && (
                <p className="text-xs text-scoreboard-amber">{MIN_SONGS - picked.length} more to go.</p>
              )}
            </Panel>

            <div>
              <label className="mb-1 block text-sm text-slate-400">Game name</label>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} inputSize="lg" className="w-full" />
            </div>

            <div>
              <label className="mb-1 block text-sm text-slate-400">Turn timer</label>
              <select
                value={turnTimer}
                onChange={(e) => setTurnTimer(Number(e.target.value))}
                className="w-full rounded-lg border border-arena-600 bg-arena-800 px-3 py-2 text-slate-100"
              >
                <option value={0}>Off — take as long as you like</option>
                {TURN_TIMER_OPTIONS.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec} seconds per turn
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Out of time passes the turn to the next team.</p>
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

            <Button type="submit" fullWidth size="lg" disabled={picked.length < MIN_SONGS}>
              START GAME →
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
