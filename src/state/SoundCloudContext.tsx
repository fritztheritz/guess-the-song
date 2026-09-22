import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  connectSoundCloud,
  disconnectSoundCloud as disconnectSoundCloudAuth,
  getStoredConnection,
  type SoundCloudConnection,
} from '../lib/soundcloud/soundcloud-auth'
import { isSoundCloudConfigured } from '../lib/soundcloud/config'

interface SoundCloudContextValue {
  connection: SoundCloudConnection | null
  isConfigured: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

const SoundCloudContext = createContext<SoundCloudContextValue | null>(null)

export function SoundCloudProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<SoundCloudConnection | null>(() => getStoredConnection())

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
    await connectSoundCloud(window.location.hash.slice(1) || '/')
  }, [])

  const disconnect = useCallback(() => {
    disconnectSoundCloudAuth()
    setConnection(null)
  }, [])

  return (
    <SoundCloudContext.Provider value={{ connection, isConfigured: isSoundCloudConfigured(), connect, disconnect }}>
      {children}
    </SoundCloudContext.Provider>
  )
}

export function useSoundCloud(): SoundCloudContextValue {
  const ctx = useContext(SoundCloudContext)
  if (!ctx) throw new Error('useSoundCloud must be used within a SoundCloudProvider')
  return ctx
}

/** Call after the /callback route establishes a connection, so context re-reads sessionStorage. */
export function refreshSoundCloudContext() {
  window.dispatchEvent(new Event('focus'))
}
