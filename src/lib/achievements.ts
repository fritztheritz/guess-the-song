import type { Team } from '../types'
import type { RecapCardStats } from './recap-card'

// Team awards derived entirely from what completed games already record (see the per-team
// tallies on Team and Game.recap) — no separate tracking, so it covers history too wherever
// that data exists. Games predating a given tally just don't contribute to that award.
// Teams are matched by name across games, same as standings (lib/tournament-standings.ts).

interface AwardTeam {
  id: string
  name: string
  color: string
  score: number
  bestStreak?: number
  maxDeficit?: number
  ejections?: number
}

// Structural, like tournament-standings' StandingsSource, so Season/Stats can feed it Games and
// Popularity/Timeline games alike — only `progress.bestStreak` differs between them.
export interface AwardSource {
  name: string
  teams: AwardTeam[]
  progress?: { completed?: boolean; bestStreak?: { count: number; teamId: string } }
  recap?: RecapCardStats
}

export interface Award {
  id: string
  icon: string
  title: string
  teamName: string
  color: string
  detail: string
  /** The joke award — shown in its own tone. */
  shame?: boolean
}

const MIN_COMEBACK = 3

function winnersOf(game: AwardSource): AwardTeam[] {
  const top = Math.max(...game.teams.map((t) => t.score))
  const winners = game.teams.filter((t) => t.score === top)
  // A tie has no single winner — nobody gets credit for it in the win-based awards.
  return winners.length === 1 ? winners : []
}

export function computeAwards(sources: AwardSource[]): Award[] {
  const games = sources.filter((g) => g.progress?.completed && g.teams.length > 0)
  if (games.length === 0) return []

  const awards: Award[] = []
  const colorOf = new Map<string, string>()
  const display = new Map<string, string>()
  for (const g of games) {
    for (const t of g.teams) {
      const key = t.name.trim().toLowerCase()
      colorOf.set(key, t.color)
      display.set(key, t.name.trim())
    }
  }
  const named = (name: string) => ({ teamName: display.get(name.trim().toLowerCase()) ?? name, color: colorOf.get(name.trim().toLowerCase()) ?? '#e8871e' })

  // Fastest Finger — quickest recorded buzz-in.
  let fastest: { ms: number; player: string; team: string; game: string } | null = null
  for (const g of games) {
    const f = g.recap?.fastestBuzz
    if (f && (!fastest || f.ms < fastest.ms)) fastest = { ms: f.ms, player: f.name, team: f.teamName, game: g.name }
  }
  if (fastest) {
    awards.push({
      id: 'fastest',
      icon: '⚡',
      title: 'Fastest Finger',
      ...named(fastest.team),
      detail: `${(fastest.ms / 1000).toFixed(2)}s by ${fastest.player} in ${fastest.game}`,
    })
  }

  // Most Wins — outright game wins (needs a real sample, or it's just "the winner").
  if (games.length >= 2) {
    const wins = new Map<string, number>()
    for (const g of games) for (const w of winnersOf(g)) wins.set(w.name.trim().toLowerCase(), (wins.get(w.name.trim().toLowerCase()) ?? 0) + 1)
    const best = Array.from(wins.entries()).sort((a, b) => b[1] - a[1])[0]
    if (best && best[1] >= 2) {
      awards.push({ id: 'wins', icon: '🏆', title: 'Most Wins', ...named(best[0]), detail: `${best[1]} game wins` })
    }
  }

  // Hot Streak — longest run of consecutive scored possessions in a single game.
  let streak: { count: number; team: string; game: string } | null = null
  for (const g of games) {
    for (const t of g.teams) {
      if ((t.bestStreak ?? 0) >= 2 && (!streak || (t.bestStreak ?? 0) > streak.count)) {
        streak = { count: t.bestStreak ?? 0, team: t.name, game: g.name }
      }
    }
    const ps = g.progress?.bestStreak
    if (ps && ps.count >= 2 && (!streak || ps.count > streak.count)) {
      streak = { count: ps.count, team: g.teams.find((t) => t.id === ps.teamId)?.name ?? 'A team', game: g.name }
    }
  }
  if (streak) {
    awards.push({
      id: 'streak',
      icon: '🔥',
      title: 'Hot Streak',
      ...named(streak.team),
      detail: `${streak.count} in a row in ${streak.game}`,
    })
  }

  // Big Bucket — the single biggest score of any possession.
  let bucket: { points: number; team: string; round: string } | null = null
  for (const g of games) {
    const b = g.recap?.biggest
    if (b && (!bucket || b.points > bucket.points)) bucket = { points: b.points, team: b.teamName, round: b.roundTitle }
  }
  if (bucket) {
    awards.push({ id: 'bucket', icon: '💥', title: 'Big Bucket', ...named(bucket.team), detail: `+${bucket.points} on "${bucket.round}"` })
  }

  // Comeback Kings — won a game after trailing by the most.
  let comeback: { deficit: number; team: string; game: string } | null = null
  for (const g of games) {
    for (const w of winnersOf(g)) {
      const d = w.maxDeficit ?? 0
      if (d >= MIN_COMEBACK && (!comeback || d > comeback.deficit)) comeback = { deficit: d, team: w.name, game: g.name }
    }
  }
  if (comeback) {
    awards.push({
      id: 'comeback',
      icon: '🪄',
      title: 'Comeback Kings',
      ...named(comeback.team),
      detail: `won ${comeback.game} after trailing by ${comeback.deficit}`,
    })
  }

  // Photo Finish — the tightest win.
  let finish: { margin: number; team: string; game: string } | null = null
  for (const g of games) {
    const m = g.recap?.winningMargin
    const w = winnersOf(g)[0]
    if (m && m > 0 && w && (!finish || m < finish.margin)) finish = { margin: m, team: w.name, game: g.name }
  }
  if (finish) {
    awards.push({
      id: 'finish',
      icon: '📸',
      title: 'Photo Finish',
      ...named(finish.team),
      detail: `won ${finish.game} by just ${finish.margin}`,
    })
  }

  // Hall of Shame — most ejected (the joke one).
  const ejected = new Map<string, number>()
  for (const g of games) for (const t of g.teams) if (t.ejections) ejected.set(t.name.trim().toLowerCase(), (ejected.get(t.name.trim().toLowerCase()) ?? 0) + t.ejections)
  const worst = Array.from(ejected.entries()).sort((a, b) => b[1] - a[1])[0]
  if (worst) {
    awards.push({
      id: 'shame',
      icon: '🟥',
      title: 'Hall of Shame',
      ...named(worst[0]),
      detail: `ejected ${worst[1]} time${worst[1] === 1 ? '' : 's'}`,
      shame: true,
    })
  }

  return awards
}

/** Folds the running per-team tallies (best streak, deepest deficit) forward after a score
 *  change — called by the host's scoring paths so the numbers are already on the saved game
 *  when it completes, rather than needing a score history. */
export function trackTeamStats(teams: Team[]): Team[] {
  const leader = Math.max(...teams.map((t) => t.score))
  return teams.map((t) => {
    const deficit = leader - t.score
    const streak = t.streak ?? 0
    const nextDeficit = Math.max(t.maxDeficit ?? 0, deficit)
    const nextStreak = Math.max(t.bestStreak ?? 0, streak)
    if (nextDeficit === (t.maxDeficit ?? 0) && nextStreak === (t.bestStreak ?? 0)) return t
    return { ...t, maxDeficit: nextDeficit, bestStreak: nextStreak }
  })
}
