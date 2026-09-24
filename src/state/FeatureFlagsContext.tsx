import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { clearFlagOverride, getAllFlagStates, setFlagOverride, type FlagState } from '../lib/feature-flags'

interface FeatureFlagsContextValue {
  flags: FlagState[]
  isEnabled: (key: string) => boolean
  setOverride: (key: string, value: boolean) => void
  resetOverride: (key: string) => void
  refresh: () => void
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null)

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FlagState[]>(() => getAllFlagStates())

  const refresh = useCallback(() => setFlags(getAllFlagStates()), [])

  const setOverride = useCallback(
    (key: string, value: boolean) => {
      setFlagOverride(key, value)
      refresh()
    },
    [refresh],
  )

  const resetOverride = useCallback(
    (key: string) => {
      clearFlagOverride(key)
      refresh()
    },
    [refresh],
  )

  const isEnabled = useCallback((key: string) => flags.find((f) => f.key === key)?.enabled ?? false, [flags])

  return (
    <FeatureFlagsContext.Provider value={{ flags, isEnabled, setOverride, resetOverride, refresh }}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}

export function useFeatureFlags() {
  const ctx = useContext(FeatureFlagsContext)
  if (!ctx) throw new Error('useFeatureFlags must be used within FeatureFlagsProvider')
  return ctx
}

/** Gate a piece of UI/behavior behind a flag by key, e.g. `if (useFeatureFlag('new-thing')) { ... }`. */
export function useFeatureFlag(key: string): boolean {
  return useFeatureFlags().isEnabled(key)
}
