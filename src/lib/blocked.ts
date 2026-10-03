import type { Game } from '../types'

// Teams that can't act for the current possession, and why. One model for everything that
// takes a team out of play so the host's buzz seeding, guess filtering, credit buttons and
// markers can't drift apart:
//  - ejected: the host's gag, lapses with the possession it was issued in
//  - sitting-out: not tied for the lead during sudden death
// (Power-Ups' Freeze deliberately isn't here — it lasts until another team misses rather than
// for a possession, so it keeps its own one-shot seeding.)
export type BlockReason = 'ejected' | 'sitting-out'

export function blockedTeams(game: Game | null, ejectedIds: string[]): Map<string, BlockReason> {
  const blocked = new Map<string, BlockReason>()
  if (game?.suddenDeath) {
    for (const t of game.teams) if (!game.suddenDeath.contenderIds.includes(t.id)) blocked.set(t.id, 'sitting-out')
  }
  for (const id of ejectedIds) blocked.set(id, 'ejected')
  return blocked
}

export const BLOCK_MARK: Record<BlockReason, string> = { ejected: '🟥 ', 'sitting-out': '🚫 ' }
