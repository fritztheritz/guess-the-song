import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useFeatureFlag } from '../state/FeatureFlagsContext'

/** Hides a route behind a feature flag — visiting the URL directly while it's off just bounces home. */
export default function RequireFlag({ flag, children }: { flag: string; children: ReactNode }) {
  const enabled = useFeatureFlag(flag)
  if (!enabled) return <Navigate to="/" replace />
  return <>{children}</>
}
