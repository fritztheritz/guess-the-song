// Mirrors the message shapes handled by worker/src/buzzer-room.js — kept in sync by hand
// since the Worker is plain JS and the two can't share a types file across that boundary.

export type BuzzState = 'closed' | 'open' | 'locked'

export interface BuzzerTeam {
  id: string
  name: string
  color: string
  avatar?: string
}

export interface BuzzerPlayer {
  connId: string
  name: string
  /** null = spectator ("just watching") — joined without picking a team. Can't buzz and
   *  never locks in a buzz winner, but still gets the live game mirror and (on Year/Tier
   *  Guess's team-agnostic free-guess windows only) can guess along for fun. */
  teamId: string | null
}

export interface BuzzerWinner {
  connId: string
  name: string
  teamId: string
  at: number
  /** Milliseconds from the clue's buzzer window opening to this buzz — null if it somehow
   *  landed before the server ever recorded an 'open' (shouldn't normally happen). */
  reactionMs: number | null
}

export type PhonePhase = 'resume' | 'intro' | 'clue' | 'revealed' | 'final' | 'halftime' | 'suddendeath' | 'ranking'
export type PhoneMode = 'song' | 'lyric' | 'tierguess' | 'year' | 'higherlower' | 'blindrank' | 'popularity' | 'draft' | 'tierlist'

// A deliberately reduced view of the game, computed host-side and pushed down through the
// same room every buzz already flows through — Phone Buzz-In's players are on their own
// devices (not a second screen on the host's machine), so they can't read localStorage the
// way Public Display does over BroadcastChannel. `revealed`/`clueText` are only ever
// populated with what's already safe to show for the current phase, same discipline as
// Public Display: never hand a phone the answer before the host has revealed it.
export interface PhoneRoundState {
  gameName: string
  possessionIndex: number
  totalPossessions: number
  phase: PhonePhase
  mode: PhoneMode
  /** Safe-to-show prompt during 'clue' (e.g. the Lyric prompt) — null when there's nothing
   *  beyond "a clip is playing" to show, or outside the 'clue' phase. */
  clueText: string | null
  /** Only set once phase is 'revealed' — the answer, simplified (no tier/year staging). */
  revealed: { title: string; artist: string; artworkUrl?: string; lyricAnswer?: string } | null
  teams: Array<{ id: string; name: string; color: string; score: number; avatar?: string }>
  /** Venue theme (Themes flag): CSS-variable overrides the host's own skin resolves to, so
   *  guests' phones match the room. Absent = the default Arena skin. */
  theme?: Record<string, string>
  /** mode: "draft" only — what a drafter's phone needs to cast a ranking ballot. The room's `teams`
   *  are the drafters; `rosters` maps each drafter id to the titles they picked (so a voter can
   *  tell whose roster is whose), and `submitted` lists who has already voted. */
  draft?: { rosters: Record<string, string[]>; submitted: string[] }
  /** mode: "higherlower" only — the card to compare against (its rank is public) and how many songs are
   *  ranked, so phones can offer Higher / Lower. The round's own rank is never sent until revealed. */
  higherLower?: { refTitle: string; refArtist: string; refArtworkUrl?: string; refRank: number; refTier?: string; size: number; title: string; artist: string; artworkUrl?: string
    /** Only once revealed: this song's rank and the right call. */
    rank?: number
    answer?: 'higher' | 'lower'
  }
  /** mode: "blindrank" only — Blind Ranking: the song to place right now (null in the lobby/results),
   *  where we are, and — only once it's over — how everyone's lists compare. A phone locks a song into a
   *  slot with a `guess` whose text is "<songIndex>:<slot>" and keeps its own picks. */
  blind?: {
    index: number
    total: number
    song: { title: string; artist: string; artworkUrl?: string } | null
    results?: { songs: string[]; matches: Array<{ name: string; closest: string | null; pct: number | null }> }
    /** One-screen Blind Ranking with phones along for the ride: a phone *suggests* a slot (same "<songIndex>:<slot>"
     *  `guess`, and it may change its mind) and the host makes the final call. `taken` are the filled slots,
     *  `placedSlot` is where the host put the current song, and `stats` (final screen only) is how close each
     *  player's suggestions were to the group's calls. */
    group?: {
      taken: Array<{ slot: number; title: string }>
      placedSlot?: number
      stats?: Array<{ name: string; answered: number; exact: number; avgOff: number }>
    }
  }
  /** mode: "tierlist" only — Group ranking: everyone on a phone files every song into a tier. `songs`
   *  is the order the ballot's digits follow; `submitted` lists the connIds that have voted. A
   *  voter's ballot rides the `ballot` message (see lib/tierlist-ballot.ts for the packing). */
  tierlist?: {
    songs: Array<{ id: string; title: string; artist: string; artworkUrl?: string; url?: string }>
    tiers: Array<{ name: string; color: string }>
    submitted: string[]
  }
  /** Year/Tier Guess, while a guess window is open: how many teams have a guess in. */
  guessProgress?: { teamsIn: number; of: number }
  /** The host has crowd reactions on — phones show the reaction bar. */
  reactions?: boolean
  /** The host has trash-talk stickers on — teamed phones show the sticker bar. */
  stickers?: boolean
  /** Sudden death is in progress — teams not tied for the lead are sitting it out. */
  suddenDeath?: boolean
  /** mode: "tierguess" only — the tier list's own defined tiers (e.g. S/A/B/C/D), so a
   *  phone can offer them as tap targets instead of free text. This is the tier *names*,
   *  never which song is in which one — same "only what's already safe to show" discipline
   *  as clueText/revealed above. */
  tiers?: Array<{ name: string; color: string }>
  /** tierguess/year only — the reveal is staged (tier → guessPosition → position, year →
   *  guessMonth → month) but `phase` alone stays 'revealed' across all three beats. This
   *  flags the one beat, besides the primary phase:'clue' window, where a second guess is
   *  being collected — closest-position/closest-month, still host-judged (not auto-scored),
   *  but relayed the same way so the host can see what came in while picking who's closest. */
  guessStage?: 'guessPosition' | 'guessMonth'
  /** mode: "tierguess", guessStage: "guessPosition" only — how many songs share the
   *  now-revealed tier, so phones can offer 1..N as tap targets instead of free typing. */
  positionCount?: number
  /** mode: "popularity" only — Guess the Popularity isn't round/possession based, so this
   *  carries its own turn state (possessionIndex/totalPossessions are just rank-1/rank count
   *  there). The pool is only the artist's songs not already placed on the board, with no
   *  hint of which one belongs at the current rank — same "only what's already safe to
   *  show" discipline as the rest of this file. A phone submits its pick as a `guess`
   *  whose text is the track's `id`. */
  popularity?: {
    rank: number
    totalRanks: number
    turnTeamId: string
    pool: Array<{ id: string; title: string }>
    /** Ids already guessed wrong for the current rank. */
    tried: string[]
    lastResult: { correct: boolean; title: string; teamName: string; timedOut?: boolean } | null
    /** Seconds left on this turn as of when this was sent (phones count down locally from
     *  receipt); null when the game's untimed. */
    turnSecondsLeft: number | null
  }
}

/** Crowd reactions a phone can send — mirrored by REACTIONS in worker/src/buzzer-room.js, which drops anything else. */
export const REACTION_EMOJIS = ['🔥', '👏', '😂', '😱', '❤️', '🤯'] as const

/** Trash-talk stickers a teamed phone can slap on the big screen — mirrored by STICKERS in worker/src/buzzer-room.js
 *  (the parity test in stickers.test.ts keeps the two lists in step). */
export const STICKERS = [
  { id: 'airball', label: 'AIRBALL' },
  { id: 'brick', label: 'BRICK' },
  { id: 'swish', label: 'SWISH' },
  { id: 'ice-cold', label: 'ICE COLD' },
  { id: 'too-easy', label: 'TOO EASY' },
  { id: 'sit-down', label: 'SIT DOWN' },
  { id: 'on-fire', label: 'ON FIRE' },
  { id: 'bench', label: 'BENCH THEM' },
] as const

export type StickerId = (typeof STICKERS)[number]['id']

export type HostOutMessage =
  | { type: 'sync-teams'; teams: BuzzerTeam[] }
  | { type: 'sync-round'; state: PhoneRoundState }
  /** frozenTeamIds (Power-Ups' Freeze, Song/Lyric only): seeds the room's `iced` set instead
   *  of starting this clue's buzz window empty — those teams can't buzz until another team
   *  misses (same "ice clears once everyone's had a turn" rule as a normal wrong judgment). */
  | { type: 'open'; frozenTeamIds?: string[] }
  | { type: 'close' }
  /** The team that just buzzed got it wrong — ice them out and reopen for everyone else. */
  | { type: 'wrong'; teamId: string }
  /** Host ejected a team for the rest of this possession (a gag). Unlike 'wrong', this only
   *  touches the buzz lock if that team happens to hold it — ejecting a bystander mustn't
   *  knock a different team's legitimate buzz-in off the board. */
  | { type: 'eject'; teamId: string }

export type PlayerOutMessage =
  /** teamId: null joins as a spectator — see BuzzerPlayer. */
  | { type: 'join'; name: string; teamId: string | null }
  | { type: 'buzz' }
  /** Only accepted from whoever's currently locked in as the buzz winner — see buzzer-room.js. */
  | { type: 'guess'; text: string }
  /** Draft ranking: a drafter's ballot — every OTHER drafter's id, best roster first. Host-only,
   *  never relayed to other players. Whose ballot it is comes from the Worker's own record of
   *  the sender's team, not from the message. */
  | { type: 'ballot'; rankedTeamIds: string[] }
  /** A crowd reaction — any joined player, spectators too. Rate-limited and host-only. */
  | { type: 'react'; emoji: string }
  /** A trash-talk sticker, optionally aimed at a rival team. Teamed players only; rate-limited and host-only. */
  | { type: 'sticker'; sticker: StickerId; targetTeamId?: string }

export type ServerMessage =
  | { type: 'state'; buzzState: BuzzState; winner: BuzzerWinner | null; order: BuzzerWinner[]; iced: string[] }
  | { type: 'roster'; players: BuzzerPlayer[] }
  | { type: 'teams'; teams: BuzzerTeam[] }
  | { type: 'round'; state: PhoneRoundState }
  | { type: 'joined'; connId: string }
  /** Host-only — never relayed to other players. What the current buzz winner typed. */
  | { type: 'guess'; connId: string; text: string }
  /** Host-only — a drafter's ranking ballot. teamId is the sender's own drafter id. */
  | { type: 'ballot'; connId: string; teamId: string; rankedTeamIds: string[] }
  /** Host-only — a phone's crowd reaction, to float across the screens. */
  | { type: 'react'; emoji: string; name: string; teamId: string | null }
  /** Host-only — a phone's sticker. targetTeamId is only ever a real rival team (or null). */
  | { type: 'sticker'; sticker: StickerId; name: string; teamId: string; targetTeamId: string | null }
