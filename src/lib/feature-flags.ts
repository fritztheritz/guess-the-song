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
    default: true,
  },
  {
    key: 'phone-buzzer',
    label: 'Phone Buzz-In',
    description:
      "Players buzz in from their own phones instead of the host picking a team — first buzz locks in that team, host still judges correct/incorrect. Needs the Cloudflare Worker's buzzer route configured; only affects Song/Lyric/Year rounds.",
    default: true,
  },
  {
    key: 'spotify-import',
    label: 'Spotify Import',
    description:
      'Search and import tracks from Spotify alongside SoundCloud. Playback goes through the Web Playback SDK and requires the host to connect a Spotify Premium account — needs VITE_SPOTIFY_CLIENT_ID configured.',
    default: false,
  },
  {
    key: 'tournaments',
    label: 'Tournaments',
    description:
      'Chain several existing games together in sequence with one running leaderboard across them, aggregated by matching team name.',
    default: true,
  },
  {
    key: 'draft',
    label: 'Song Draft',
    description:
      'A shared song pool that teams snake-draft 5 songs from, one pick at a time on a shared screen — once a song is picked, it\'s off the board for every future draft too. Ends with everyone ranking every other team\'s roster to crown a winner.',
    default: true,
  },
  {
    key: 'popularity',
    label: 'Guess the Popularity',
    description:
      "Pick a Spotify artist, pull their top 10 most popular tracks, and guess which song holds each rank — teams take turns guessing, cycling until someone gets it right, then move to the next rank. Needs Spotify connected.",
    default: false,
  },
  {
    key: 'timeline',
    label: 'Guess the Timeline',
    description:
      "Build a deck of Spotify songs, then teams take turns slotting each mystery song into a shared timeline by release year — right placements score (with streak bonuses) and stay on the board, misses are discarded. Needs Spotify connected.",
    default: false,
  },
  {
    key: 'draft-soundcloud-playlists',
    label: 'Draft: SoundCloud Playlists',
    description:
      "On the draft's Listening Time screen: save each drafter's picks as a SoundCloud playlist, and play tracks inline via this app's own SoundCloud connection. Still being worked through — playback via the connected account isn't confirmed working yet.",
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
