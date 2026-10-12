import { describe, expect, it } from 'vitest'
import { teamWinRates, weeklyActivity } from './stats-charts'

const game = (scores: Array<[string, number]>, completed = true) => ({
  teams: scores.map(([name, score]) => ({ name, color: '#fff', score })),
  progress: { completed },
})

describe('teamWinRates', () => {
  it('counts outright wins per team across finished games only', () => {
    const rows = teamWinRates([game([['A', 5], ['B', 3]]), game([['A', 2], ['B', 4]]), game([['A', 9], ['B', 1]]), game([['A', 1], ['B', 9]], false)])
    expect(rows.find((r) => r.name === 'A')).toMatchObject({ games: 3, wins: 2 })
    expect(rows.find((r) => r.name === 'B')).toMatchObject({ games: 3, wins: 1 })
    expect(rows[0].name).toBe('A')
  })

  it("doesn't count a tie for first as a win", () => {
    const [a] = teamWinRates([game([['A', 5], ['B', 5]])])
    expect(a.wins).toBe(0)
  })
})

describe('weeklyActivity', () => {
  it('buckets dates into Monday-start weeks, oldest first', () => {
    const now = new Date(2026, 9, 14) // Wed 14 Oct 2026
    const out = weeklyActivity(['2026-10-13T12:00:00', '2026-10-12T00:30:00', '2026-10-05T10:00:00', '2025-01-01T00:00:00'], 3, now)
    expect(out.map((b) => b.start)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12'])
    expect(out.map((b) => b.count)).toEqual([0, 1, 2])
  })
})
