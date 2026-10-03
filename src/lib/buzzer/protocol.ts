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

export type PhonePhase = 'resume' | 'intro' | 'clue' | 'revealed' | 'final' | 'halftime'
export type PhoneMode = 'song' | 'lyric' | 'tierguess' | 'year' | 'popularity'

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

export type ServerMessage =
  | { type: 'state'; buzzState: BuzzState; winner: BuzzerWinner | null; order: BuzzerWinner[]; iced: string[] }
  | { type: 'roster'; players: BuzzerPlayer[] }
  | { type: 'teams'; teams: BuzzerTeam[] }
  | { type: 'round'; state: PhoneRoundState }
  | { type: 'joined'; connId: string }
  /** Host-only — never relayed to other players. What the current buzz winner typed. */
  | { type: 'guess'; connId: string; text: string }
