import { describe, expect, it } from 'vitest'
import { buildQuickGame, buildQuickRounds, pickClipStart, shuffled, type QuickTrack } from './quick-game'

const sc = (i: number, extra: Partial<Extract<QuickTrack, { source: 'soundcloud' }>> = {}): QuickTrack => ({
  source: 'soundcloud',
  soundcloudTrackId: String(i),
  title: `Song ${i}`,
  artist: `Artist ${i}`,
  duration: 200,
  isPrivate: false,
  access: 'playable',
  ...extra,
})

// A fixed "random" stream so tests are repeatable.
const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('pickClipStart', () => {
  it('skips the intro but always leaves room for the longest clip', () => {
    for (const r of [0, 0.5, 0.999]) {
      const start = pickClipStart(200, () => r)
      expect(start).toBeGreaterThanOrEqual(30)
      expect(start + 10).toBeLessThanOrEqual(200)
    }
  })
  it('starts at 0 for short or unknown-length tracks', () => {
    expect(pickClipStart(15, () => 0.9)).toBe(0)
    expect(pickClipStart(undefined)).toBe(0)
  })
})

describe('shuffled', () => {
  it('keeps every item and does not touch the original', () => {
    const items = [1, 2, 3, 4, 5]
    const out = shuffled(items, seq(0.1, 0.9, 0.4, 0.6))
    expect([...out].sort()).toEqual(items)
    expect(items).toEqual([1, 2, 3, 4, 5])
  })
})

describe('buildQuickRounds', () => {
  it('picks the requested number of distinct playable tracks', () => {
    const tracks = [sc(1), sc(1), sc(2, { access: 'blocked' }), sc(3), sc(4), sc(5)]
    const rounds = buildQuickRounds(tracks, 3)
    expect(rounds).toHaveLength(3)
    expect(new Set(rounds.map((r) => r.soundcloudTrackId)).size).toBe(3)
    expect(rounds.map((r) => r.soundcloudTrackId)).not.toContain('2')
  })
  it('returns what it has when there are fewer tracks than asked for', () => {
    expect(buildQuickRounds([sc(1), sc(2)], 10)).toHaveLength(2)
  })
  it('gives each round a clip start inside the track', () => {
    for (const r of buildQuickRounds([sc(1), sc(2), sc(3)], 3)) expect(r.clipStart).toBeLessThanOrEqual(200 - 12)
  })
  it('handles Spotify tracks too', () => {
    const rounds = buildQuickRounds([{ source: 'spotify', spotifyTrackId: 'x', spotifyUri: 'spotify:track:x', title: 'T', artist: 'A', duration: 180 } as QuickTrack], 1)
    expect(rounds[0]).toMatchObject({ source: 'spotify', spotifyTrackId: 'x' })
  })
})

describe('buildQuickGame', () => {
  it('makes a Song game with the right number of named teams and rounds', () => {
    const g = buildQuickGame([sc(1), sc(2), sc(3), sc(4)], { teamCount: 3, roundCount: 2 })
    expect(g.mode).toBe('song')
    expect(g.teams).toHaveLength(3)
    expect(new Set(g.teams.map((t) => t.name)).size).toBe(3)
    expect(g.rounds).toHaveLength(2)
    expect(g.name).toMatch(/^Quick Game/)
  })
})
