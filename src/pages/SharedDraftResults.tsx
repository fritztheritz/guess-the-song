import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { parseDraftResultsShareData, DraftShareLinkError, type ShareableDraftResults } from '../lib/draft-share'

// Public, no-auth, param-driven — same idea as ImportGame.tsx, but this page only ever reads
// what's already embedded in the URL and never touches localStorage, since a viewer opening
// a shared link has no draft board of their own on this device.
export default function SharedDraftResults() {
  const [searchParams] = useSearchParams()
  const [results, setResults] = useState<ShareableDraftResults | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const data = searchParams.get('data')
    if (!data) {
      setError('This link is missing its results data.')
      return
    }
    parseDraftResultsShareData(data)
      .then(setResults)
      .catch((err) => setError(err instanceof DraftShareLinkError ? err.message : 'Could not open this results link.'))
  }, [searchParams])

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center court-lines px-6">
        <div className="w-full max-w-md rounded-2xl border border-arena-600 bg-arena-800/60 p-8 text-center">
          <div className="mb-2 font-display text-2xl tracking-wide text-scoreboard-500">LINK FAILED</div>
          <p className="mb-6 text-slate-400">{error}</p>
          <Link to="/" className="inline-block rounded-full bg-hardwood-500 px-6 py-2.5 font-semibold text-arena-950 hover:bg-hardwood-400">
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="flex min-h-svh items-center justify-center court-lines px-6 text-slate-400">
        <p>Opening link…</p>
      </div>
    )
  }

  return (
    <div className="min-h-svh court-lines px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest text-slate-500">{results.boardName}</div>
          <div className="font-display text-2xl tracking-wide text-white">{results.sessionName}</div>
          <div className="mt-1 font-display text-4xl tracking-widest text-hardwood-400">FINAL STANDINGS</div>
        </div>

        <div className="space-y-2">
          {results.standings.map((standing, i) => (
            <div key={i} className="rounded-xl border border-arena-600 bg-arena-800/70 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-display text-lg" style={{ color: standing.color }}>
                  {i === 0 ? '🏆 ' : ''}
                  {standing.avatar ? `${standing.avatar} ` : ''}
                  {standing.name}
                </div>
                <div className="scoreboard-digit font-display text-2xl text-slate-100">{standing.points} pts</div>
              </div>
              {standing.songs.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
                  {standing.songs.map((song, j) => (
                    <li key={j} className="truncate">
                      {song.title} <span className="text-slate-500">— {song.artist}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-slate-600">Shared from Buzzer Beats — this is a read-only view.</p>
      </div>
    </div>
  )
}
