import { createContext, useContext } from 'react'
import type { FlagState } from '../lib/feature-flags'

export interface FeatureFlagsContextValue {
  flags: FlagState[]
  isEnabled: (key: string) => boolean
  setOverride: (key: string, value: boolean) => void
  resetOverride: (key: string) => void
  refresh: () => void
}

export const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null)

export function useFeatureFlags() {
  const ctx = useContext(FeatureFlagsContext)
  if (!ctx) throw new Error('useFeatureFlags must be used within FeatureFlagsProvider')
  return ctx
}

/** Gate a piece of UI/behavior behind a flag by key, e.g. `if (useFeatureFlag('new-thing')) { ... }`. */
export function useFeatureFlag(key: string): boolean {
  return useFeatureFlags().isEnabled(key)
}
