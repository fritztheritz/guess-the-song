import { describe, expect, it } from 'vitest'
import { isHalftime, tiedLeaders } from './possession'
import { gameWith } from './test-helpers'

const withRounds = (n: number, halftimeEnabled = true) => ({ rounds: Array.from({ length: n }, () => ({}) as never), halftimeEnabled })

describe('isHalftime', () => {
  it('fires on the halfway possession once', () => {
    expect(isHalftime(withRounds(10), 5, false)).toBe(true)
    expect(isHalftime(withRounds(10), 4, false)).toBe(false)
    expect(isHalftime(withRounds(10), 5, true)).toBe(false)
  })
  it('needs the setting and at least four possessions', () => {
    expect(isHalftime(withRounds(10, false), 5, false)).toBe(false)
    expect(isHalftime(withRounds(3), 1, false)).toBe(false)
    expect(isHalftime(withRounds(4), 2, false)).toBe(true)
  })
})

describe('tiedLeaders', () => {
  it('returns every team tied at the top', () => {
    expect(tiedLeaders(gameWith([5, 5, 2]))).toEqual(['t1', 't2'])
  })
  it('returns null for a clear winner or a single team', () => {
    expect(tiedLeaders(gameWith([6, 5]))).toBeNull()
    expect(tiedLeaders(gameWith([4]))).toBeNull()
  })
})
