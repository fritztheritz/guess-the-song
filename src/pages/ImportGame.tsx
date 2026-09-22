import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createGame, createTeam, isLyricMode, type Game } from '../types'
import { saveGame } from '../lib/storage/game-repository'
import { parseShareData, ShareLinkError } from '../lib/game-share'

export default function ImportGame() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof parseShareData>> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const data = searchParams.get('data')
    if (!data) {
      setError('This link is missing its game data.')
      return
    }
    parseShareData(data)
      .then(setPreview)
      .catch((err) => setError(err instanceof ShareLinkError ? err.message : 'Could not open this game link.'))
  }, [searchParams])

  function importGame() {
    if (!preview) return
    const teams = preview.teams.map((t) => createTeam(t.name, t.color))
    const game: Game = { ...createGame(preview.name, teams, preview.mode ?? 'song'), rounds: preview.rounds }
    saveGame(game)
    navigate(`/games/${game.id}/edit`, { replace: true })
  }

  return (
    <div className="flex min-h-svh items-center justify-center court-lines px-6">
      <div className="w-full max-w-md rounded-2xl border border-arena-600 bg-arena-800/60 p-8 text-center">
        {error ? (
          <>
            <div className="mb-2 font-display text-2xl tracking-wide text-scoreboard-500">LINK FAILED</div>
            <p className="mb-6 text-slate-400">{error}</p>
            <button onClick={() => navigate('/')} className="rounded-full bg-hardwood-500 px-6 py-2.5 font-semibold text-arena-950 hover:bg-hardwood-400">
              Back to home
            </button>
          </>
        ) : preview ? (
          <>
            <div className="mb-1 text-sm uppercase tracking-widest text-slate-500">Import Game</div>
            <div className="mb-2 font-display text-3xl tracking-wide text-hardwood-400">{preview.name}</div>
            <p className="mb-6 text-slate-400">
              {preview.rounds.length} possession{preview.rounds.length === 1 ? '' : 's'} · {preview.teams.map((t) => t.name).join(' vs ')}
            </p>
            {!isLyricMode(preview) && (
              <p className="mb-6 text-xs text-slate-500">
                Private SoundCloud tracks the sender owns (not shared via a private link) may not be playable for you unless
                your own SoundCloud account can access them.
              </p>
            )}
            <button onClick={importGame} className="rounded-full bg-hardwood-500 px-8 py-2.5 font-semibold text-arena-950 hover:bg-hardwood-400">
              IMPORT GAME
            </button>
          </>
        ) : (
          <p className="text-slate-400">Opening link…</p>
        )}
      </div>
    </div>
  )
}
