// Feature flags for testing new features in prod before rolling them out to everyone.
// Flags live in this one array — add an entry here, then gate the new code behind
// `isFlagEnabled('your-key')` (or the `useFeatureFlag` hook in a component). Toggle it
// on for yourself from /admin without touching code. Once you're happy with a
// feature, ask to have the flag removed: delete its entry here and replace the
// `isFlagEnabled(...)` check at each call site with the feature just always running —
// that's what unblocks it for everyone.
export interface FeatureFlagDef {
  key: string
  label: string
  description: string
  /** What the flag evaluates to for anyone who hasn't overridden it — normally false for an in-progress feature. */
  default: boolean
}

export const FEATURE_FLAGS: FeatureFlagDef[] = [
  {
    key: 'tier-lists',
    label: 'SoundCloud Tier Lists',
    description: 'Build a tier list from SoundCloud tracks, then rank them live with drag-and-drop on a shared screen.',
    default: false,
  },
  {
    key: 'phone-buzzer',
    label: 'Phone Buzz-In',
    description:
      "Players buzz in from their own phones instead of the host picking a team — first buzz locks in that team, host still judges correct/incorrect. Needs the Cloudflare Worker's buzzer route configured; only affects Song/Lyric/Year rounds.",
    default: false,
  },
]

const STORAGE_KEY = 'gts.flags.v1'

function readOverrides(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeOverrides(overrides: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // Storage unavailable/full — flags just fall back to their defaults, non-fatal.
  }
}

export function isFlagEnabled(key: string): boolean {
  const def = FEATURE_FLAGS.find((f) => f.key === key)
  const overrides = readOverrides()
  if (key in overrides) return overrides[key]
  return def?.default ?? false
}

export function setFlagOverride(key: string, value: boolean) {
  const overrides = readOverrides()
  overrides[key] = value
  writeOverrides(overrides)
}

export function clearFlagOverride(key: string) {
  const overrides = readOverrides()
  delete overrides[key]
  writeOverrides(overrides)
}

export function clearAllOverrides() {
  writeOverrides({})
}

export interface FlagState extends FeatureFlagDef {
  enabled: boolean
  overridden: boolean
}

export function getAllFlagStates(): FlagState[] {
  const overrides = readOverrides()
  return FEATURE_FLAGS.map((f) => ({
    ...f,
    enabled: f.key in overrides ? overrides[f.key] : f.default,
    overridden: f.key in overrides,
  }))
}
