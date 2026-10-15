import type { SpotName } from '../components/Spot'

/** Which scene suits the emoji an empty state was written with. */
export function spotFor(icon: string): SpotName {
  if (icon.includes('🔎') || icon.includes('🔍')) return 'search'
  if (/[📋📊🚩🏷]/u.test(icon)) return 'board'
  if (icon.includes('🏀')) return 'ball'
  return 'bench'
}
