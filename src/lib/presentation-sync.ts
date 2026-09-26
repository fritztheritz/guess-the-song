// Cross-window sync for the Host Controller / Public Display split. Scores, teams and
// progress already sync for free via the existing localStorage `storage` event (any tab
// that isn't the one writing gets notified) — this only needs to carry the ephemeral,
// never-persisted presentation state that the storage event can't: which phase/possession/
// clue/tierguess-stage is currently showing, and whether a clip is playing right now.
export type TierGuessStage = 'tier' | 'guessPosition' | 'position'
// Mirrors TierGuessStage's three-beat shape: coarse guess revealed+scored, a thinking beat
// for the fine guess (coarse answer already known), then the fine guess revealed+scored.
export type YearGuessStage = 'year' | 'guessMonth' | 'month'
export type PresentationPhase = 'resume' | 'intro' | 'clue' | 'revealed' | 'final' | 'halftime'

export interface PresentationSnapshot {
  phase: PresentationPhase
  possessionIndex: number
  clueIndex: number
  tierGuessStage: TierGuessStage
  yearGuessStage: YearGuessStage
  /** Set the instant a clip starts playing so the Public Display can run its own local
   *  countdown from `startedAt` — avoids broadcasting every 100ms shot-clock tick. */
  playing: { duration: number; startedAt: number } | null
  /** Song/lyric rounds only — set once the host locks in who's wagering and how much. */
  wager: { teamName: string; teamColor: string; amount: number } | null
  /** phase: "halftime" only — the random flavor line the host's screen picked, so Public
   *  Display shows the same one instead of independently picking a mismatched one. */
  halftimePrompt: string | null
}

export type PresentationMessage = { type: 'request-sync' } | { type: 'state'; snapshot: PresentationSnapshot }

export function presentationChannelName(gameId: string): string {
  return `gts-presentation-${gameId}`
}
