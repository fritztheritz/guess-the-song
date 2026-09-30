import { useCallback, useState, type ReactNode } from 'react'
import { clearFlagOverride, getAllFlagStates, setFlagOverride, type FlagState } from '../lib/feature-flags'
import { FeatureFlagsContext } from './feature-flags-context'

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
