// Pure helpers behind the charts on Stats and a player's profile.

interface ScoredTeam {
  name: string
  color: string
  score: number
}
interface ScoredGame {
  teams: ScoredTeam[]
  progress?: { completed?: boolean }
}

export interface WinRate {
  name: string
  color: string
  games: number
  wins: number
}

/** Per team name: finished games played and how many it won outright (a tie for first isn't a win). */
export function teamWinRates(games: ScoredGame[]): WinRate[] {
  const byName = new Map<string, WinRate>()
  for (const g of games) {
    if (!g.progress?.completed || g.teams.length === 0) continue
    const top = Math.max(...g.teams.map((t) => t.score))
    const leaders = g.teams.filter((t) => t.score === top)
    for (const t of g.teams) {
      const row = byName.get(t.name) ?? { name: t.name, color: t.color, games: 0, wins: 0 }
      row.games += 1
      if (leaders.length === 1 && leaders[0] === t) row.wins += 1
      byName.set(t.name, row)
    }
  }
  return [...byName.values()].sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)
}

export interface WeekBucket {
  /** ISO date (YYYY-MM-DD) of that week's Monday. */
  start: string
  count: number
}

const DAY = 86_400_000

function mondayOf(d: Date): Date {
  const day = (d.getDay() + 6) % 7 // Monday = 0
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day)
  return m
}

const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** How many of `dates` fall in each of the last `weeks` weeks (Monday-start), oldest first. */
export function weeklyActivity(dates: string[], weeks: number, now: Date): WeekBucket[] {
  const thisMonday = mondayOf(now)
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - (weeks - 1 - i) * 7)
    return { start: iso(start), count: 0 }
  })
  const first = new Date(buckets[0].start + 'T00:00:00').getTime()
  for (const raw of dates) {
    const t = new Date(raw)
    if (Number.isNaN(t.getTime())) continue
    const idx = Math.floor((mondayOf(t).getTime() - first + DAY / 2) / (7 * DAY))
    if (idx >= 0 && idx < weeks) buckets[idx].count += 1
  }
  return buckets
}
