import { createContext, useContext } from 'react'
import type { SpotifyConnection } from '../lib/spotify/spotify-auth'

export interface SpotifyContextValue {
  connection: SpotifyConnection | null
  isConfigured: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

export const SpotifyContext = createContext<SpotifyContextValue | null>(null)

export function useSpotify(): SpotifyContextValue {
  const ctx = useContext(SpotifyContext)
  if (!ctx) throw new Error('useSpotify must be used within a SpotifyProvider')
  return ctx
}

/** Call after the /callback route establishes a connection, so context re-reads sessionStorage. */
export function refreshSpotifyContext() {
  window.dispatchEvent(new Event('focus'))
}
