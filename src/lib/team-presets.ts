import { listGames } from './storage/game-repository'

export interface TeamPreset {
  name: string
  color: string
  avatar?: string
}

// Derived from every team that's ever played a game — no storage of its own, same "derive
// suggestions from existing games" approach as Game.tags' suggestion list elsewhere. Deduped
// by name (case-insensitive); listGames() is already sorted newest-first, so the first team
// seen per name is that team's most recently used color/avatar.
export function listTeamPresets(): TeamPreset[] {
  const seen = new Map<string, TeamPreset>()
  for (const game of listGames()) {
    for (const team of game.teams) {
      const key = team.name.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.set(key, { name: team.name, color: team.color, avatar: team.avatar })
    }
  }
  return Array.from(seen.values())
}
