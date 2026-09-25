import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  connectSpotify,
  disconnectSpotify as disconnectSpotifyAuth,
  getStoredConnection,
  type SpotifyConnection,
} from '../lib/spotify/spotify-auth'
import { isSpotifyConfigured } from '../lib/spotify/config'

interface SpotifyContextValue {
  connection: SpotifyConnection | null
  isConfigured: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

const SpotifyContext = createContext<SpotifyContextValue | null>(null)

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

export function useSpotify(): SpotifyContextValue {
  const ctx = useContext(SpotifyContext)
  if (!ctx) throw new Error('useSpotify must be used within a SpotifyProvider')
  return ctx
}

/** Call after the /callback route establishes a connection, so context re-reads sessionStorage. */
export function refreshSpotifyContext() {
  window.dispatchEvent(new Event('focus'))
}
