// Cross-window sync for the Host Controller / Public Display split. Scores, teams and
// progress already sync for free via the existing localStorage `storage` event (any tab
// that isn't the one writing gets notified) — this only needs to carry the ephemeral,
// never-persisted presentation state that the storage event can't: which phase/possession/
// clue/tierguess-stage is currently showing, and whether a clip is playing right now.
export type TierGuessStage = 'tier' | 'guessPosition' | 'position'
export type PresentationPhase = 'resume' | 'intro' | 'clue' | 'revealed' | 'final'

export interface PresentationSnapshot {
  phase: PresentationPhase
  possessionIndex: number
  clueIndex: number
  tierGuessStage: TierGuessStage
  /** Set the instant a clip starts playing so the Public Display can run its own local
   *  countdown from `startedAt` — avoids broadcasting every 100ms shot-clock tick. */
  playing: { duration: number; startedAt: number } | null
}

export type PresentationMessage = { type: 'request-sync' } | { type: 'state'; snapshot: PresentationSnapshot }

export function presentationChannelName(gameId: string): string {
  return `gts-presentation-${gameId}`
}
