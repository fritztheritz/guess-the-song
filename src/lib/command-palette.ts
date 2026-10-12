// Ranking for the ⌘K command palette — pure so the ordering can be tested.

export interface Command {
  id: string
  label: string
  /** Extra words that should match (e.g. "present", "edit"). */
  keywords?: string
  /** Small right-aligned tag, e.g. "Game" or "Tier list". */
  kind: string
  to: string
  icon: string
}

/** Score a command against a query: 0 = no match; higher = better. Every query word must appear somewhere. */
export function scoreCommand(cmd: Command, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 1
  const label = cmd.label.toLowerCase()
  const haystack = `${label} ${cmd.kind.toLowerCase()} ${(cmd.keywords ?? '').toLowerCase()}`
  let score = 0
  for (const w of words) {
    if (!haystack.includes(w)) return 0
    if (label.startsWith(w)) score += 4
    else if (label.split(/\s+/).some((part) => part.startsWith(w))) score += 3
    else if (label.includes(w)) score += 2
    else score += 1
  }
  return score
}

export function rankCommands(commands: Command[], query: string, limit = 12): Command[] {
  return commands
    .map((cmd, i) => ({ cmd, i, score: scoreCommand(cmd, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.cmd)
}
