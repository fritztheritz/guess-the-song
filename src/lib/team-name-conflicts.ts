// Shared by every team-roster editor (CreateGame, CreatePopularityGame, CreateTimelineGame)
// — surfaced as an inline warning next to the team list rather than blocking submit, since
// a duplicate name isn't invalid, just confusing: Stats' cross-game leaderboard and
// Tournament standings both merge teams by matching name (case/whitespace-insensitive), so
// two teams sharing one in the same roster would also merge into a single line there.

/** Returns the first duplicated team name (trimmed, original casing), or null if none
 *  collide. Blank names are skipped — every create form falls back to a numbered "Team N"
 *  for those before saving, so an empty field isn't a real conflict yet. */
export function findDuplicateTeamName(names: string[]): string | null {
  const seen = new Set<string>()
  for (const raw of names) {
    const trimmed = raw.trim()
    const key = trimmed.toLowerCase()
    if (!key) continue
    if (seen.has(key)) return trimmed
    seen.add(key)
  }
  return null
}
