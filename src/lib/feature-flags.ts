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
  {
    key: 'seasons',
    label: 'Seasons / Leagues',
    description:
      'Name a recurring season and give it a tag — every completed game (of any type) carrying that tag automatically counts toward its standings, so a weekly game night builds a running leaderboard with no per-game bookkeeping.',
    default: false,
  },
  {
    key: 'power-ups',
    label: 'Power-Ups',
    description:
      "Each team gets a limited number of Double Points, Steal, and Freeze (default 1 of each, adjustable per game in the builder) to spend during Song/Lyric rounds — Double doubles their next correct answer, Steal also docks the current leader, Freeze blocks a rival from buzzing on the next clue. The host taps them on a team's behalf from the presentation screen.",
    default: false,
  },
  {
    key: 'achievements',
    label: 'Awards & Achievements',
    description:
      "Team awards on the Stats page and each Season's board — Fastest Finger, Most Wins, Hot Streak, Big Bucket, Comeback Kings, Photo Finish, and the Hall of Shame (most ejected). Computed from completed games; games played before tracking existed just won't count toward some awards.",
    default: false,
  },
  {
    key: 'themes',
    label: 'Venue Themes',
    description:
      "Re-skin the whole app with a saved color/font theme (Holiday, Bar Night, Beach Party, Halloween, Black Tie, or your own custom colors) from the 🎨 button on Home. The host's skin also carries over to the Public Display and to guests' phones in Phone Buzz-In.",
    default: false,
  },
  {
    key: 'sudden-death',
    label: 'Sudden-Death Tiebreaker',
    description:
      "If a game ends tied for the lead, play a reserve tiebreaker round among just the tied teams (set reserve rounds aside in the builder with 🥇) — or, with none left, the host picks the winner. Everyone else sits it out.",
    default: false,
  },
  {
    key: 'soundboard',
    label: 'Host Soundboard',
    description:
      "A 🎛️ panel on the presentation screen — airhorn, applause, crickets, sad trombone, drumroll, rimshot — also on hotkeys Z X C V B N, for the host to fire at the room.",
    default: false,
  },
  {
    key: 'eject',
    label: 'Eject a Team',
    description:
      "Host can \"eject\" a team from the current possession with a referee-whistle, slam-in EJECTED banner — they can't buzz in (Song/Lyric) or have their phone guesses count or be credited (Guess the Ranking/Year) for the rest of that possession. Purely for laughs.",
    default: false,
  },
  {
    key: 'spectator-mode',
    label: 'Spectator Mode',
    description:
      "Adds a \"Just watching\" option to the Phone Buzz-In join screen for people who aren't on a team — they see the same live game mirror and can guess along on Guess the Year/Tier rounds for fun, with no score impact.",
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
