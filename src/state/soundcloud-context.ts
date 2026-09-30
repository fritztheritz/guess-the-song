import { createContext, useContext } from 'react'
import type { SoundCloudConnection } from '../lib/soundcloud/soundcloud-auth'

export interface SoundCloudContextValue {
  connection: SoundCloudConnection | null
  isConfigured: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

export const SoundCloudContext = createContext<SoundCloudContextValue | null>(null)

export function useSoundCloud(): SoundCloudContextValue {
  const ctx = useContext(SoundCloudContext)
  if (!ctx) throw new Error('useSoundCloud must be used within a SoundCloudProvider')
  return ctx
}

/** Call after the /callback route establishes a connection, so context re-reads sessionStorage. */
export function refreshSoundCloudContext() {
  window.dispatchEvent(new Event('focus'))
}
