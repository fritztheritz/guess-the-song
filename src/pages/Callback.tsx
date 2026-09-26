import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { handleCallback as handleSoundCloudCallback } from '../lib/soundcloud/soundcloud-auth'
import { handleCallback as handleSpotifyCallback, isSpotifyState } from '../lib/spotify/spotify-auth'
import { refreshSoundCloudContext } from '../state/SoundCloudContext'
import { refreshSpotifyContext } from '../state/SpotifyContext'
import Spinner from '../components/Spinner'

export default function Callback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<'SoundCloud' | 'Spotify'>('SoundCloud')

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? window.location.search)
    // Both providers land here (see main.tsx) — `state`'s prefix, set when the connect
    // flow started (spotify-auth.ts's STATE_PREFIX / soundcloud-auth.ts's generateState
    // call), is what tells us which one this redirect belongs to.
    const isSpotify = isSpotifyState(params.get('state'))
    setProvider(isSpotify ? 'Spotify' : 'SoundCloud')
    const handler = isSpotify ? handleSpotifyCallback : handleSoundCloudCallback
    const refreshContext = isSpotify ? refreshSpotifyContext : refreshSoundCloudContext

    handler(params)
      .then((returnTo) => {
        refreshContext()
        navigate(returnTo || '/', { replace: true })
      })
      .catch((err) => setError(err instanceof Error ? err.message : `${isSpotify ? 'Spotify' : 'SoundCloud'} connection failed.`))
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
          <Spinner className="mx-auto h-10 w-10" />
          <p className="text-slate-300">Connecting to {provider}…</p>
        </div>
      )}
    </div>
  )
}
