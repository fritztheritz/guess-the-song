import type { Game, PossessionRecord } from '../types'

// A running log of how a game went, one entry per possession, so a finished game can be replayed:
// who scored when, how the lead moved, which possession swung it. Pure — the Host Controller calls
// recordPossession as each possession ends.

const scoresOf = (g: Pick<Game, 'teams'>): Record<string, number> => Object.fromEntries(g.teams.map((t) => [t.id, t.score]))

/** Adds (or replaces, if that possession is replayed) the entry for possession `index`. `startScores`
 *  is where every team stood when it began, so each entry carries what it was worth. */
export function recordPossession(
  game: Game,
  index: number,
  info: { title: string; artist: string; startScores: Record<string, number> },
): Game {
  const scores = scoresOf(game)
  const gains: Record<string, number> = {}
  for (const t of game.teams) {
    const gain = t.score - (info.startScores[t.id] ?? 0)
    if (gain !== 0) gains[t.id] = gain
  }
  const entry: PossessionRecord = { index, title: info.title, artist: info.artist, scores, gains }
  const history = [...(game.history ?? []).filter((h) => h.index !== index), entry].sort((a, b) => a.index - b.index)
  return { ...game, history }
}

export interface Series {
  teamId: string
  name: string
  color: string
  /** Cumulative score after each recorded possession (starting with the score before the first). */
  points: number[]
}

/** Each team's score over time, for the replay chart. Index 0 is the score before possession one. */
export function cumulativeSeries(game: Game): Series[] {
  const history = game.history ?? []
  return game.teams.map((t) => {
    const first = history[0]
    const start = first ? (first.scores[t.id] ?? 0) - (first.gains[t.id] ?? 0) : 0
    return { teamId: t.id, name: t.name, color: t.color, points: [start, ...history.map((h) => h.scores[t.id] ?? 0)] }
  })
}

export interface ReplaySummary {
  /** How many times the (sole) leader changed hands. */
  leadChanges: number
  /** The biggest single-possession haul. */
  biggest: { index: number; title: string; teamId: string; points: number } | null
  /** The team that trailed the most at some point and still finished on top, if any. */
  comeback: { teamId: string; deficit: number } | null
  /** Possessions nobody scored in. */
  scoreless: number
}

export function summarizeReplay(game: Game): ReplaySummary {
  const history = game.history ?? []
  let leadChanges = 0
  let leader: string | null = null
  let biggest: ReplaySummary['biggest'] = null
  let scoreless = 0
  for (const h of history) {
    const entries = Object.entries(h.scores)
    const top = Math.max(...entries.map(([, s]) => s))
    const leaders = entries.filter(([, s]) => s === top)
    if (leaders.length === 1) {
      if (leader !== null && leader !== leaders[0][0]) leadChanges += 1
      leader = leaders[0][0]
    }
    const gains = Object.entries(h.gains)
    if (gains.length === 0) scoreless += 1
    for (const [teamId, points] of gains) if (points > 0 && (!biggest || points > biggest.points)) biggest = { index: h.index, title: h.title, teamId, points }
  }
  const final = history[history.length - 1]
  let comeback: ReplaySummary['comeback'] = null
  if (final) {
    const top = Math.max(...Object.values(final.scores))
    const winners = Object.entries(final.scores).filter(([, s]) => s === top)
    if (winners.length === 1) {
      const winner = winners[0][0]
      let worst = 0
      for (const h of history) worst = Math.max(worst, Math.max(...Object.values(h.scores)) - (h.scores[winner] ?? 0))
      if (worst >= 3) comeback = { teamId: winner, deficit: worst }
    }
  }
  return { leadChanges, biggest, comeback, scoreless }
}
