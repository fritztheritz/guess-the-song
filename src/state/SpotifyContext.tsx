import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  connectSpotify,
  disconnectSpotify as disconnectSpotifyAuth,
  getStoredConnection,
  type SpotifyConnection,
} from '../lib/spotify/spotify-auth'
import { isSpotifyConfigured } from '../lib/spotify/config'
import { SpotifyContext } from './spotify-context'

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<SpotifyConnection | null>(() => getStoredConnection())

  useEffect(() => {
    const onStorage = () => setConnection(getStoredConnection())
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onStorage)
    }
  }, [])

  const connect = useCallback(async () => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    const path = window.location.pathname.slice(base.length) || '/'
    await connectSpotify(path)
  }, [])

  const disconnect = useCallback(() => {
    disconnectSpotifyAuth()
    setConnection(null)
  }, [])

  return (
    <SpotifyContext.Provider value={{ connection, isConfigured: isSpotifyConfigured(), connect, disconnect }}>
      {children}
    </SpotifyContext.Provider>
  )
}
