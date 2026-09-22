import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { handleCallback } from '../lib/soundcloud/soundcloud-auth'
import { refreshSoundCloudContext } from '../state/SoundCloudContext'

export default function Callback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? window.location.search)
    handleCallback(params)
      .then((returnTo) => {
        refreshSoundCloudContext()
        navigate(returnTo || '/', { replace: true })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'SoundCloud connection failed.'))
  }, [navigate])

  return (
    <div className="min-h-svh flex items-center justify-center bg-arena-950 text-center px-6">
      {error ? (
        <div className="max-w-md space-y-4">
          <p className="text-scoreboard-500 font-display text-2xl tracking-wide">CONNECTION FAILED</p>
          <p className="text-slate-300">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="rounded-full bg-hardwood-500 px-6 py-2 font-semibold text-arena-950 hover:bg-hardwood-400"
          >
            Back to home
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-arena-600 border-t-hardwood-500" />
          <p className="text-slate-300">Connecting to SoundCloud…</p>
        </div>
      )}
    </div>
  )
}
