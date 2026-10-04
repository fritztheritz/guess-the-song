import { describe, expect, it } from 'vitest'
import { closestMatcher, gradeGuesses, isExactMonth, isExactPosition, monthNumber } from './guess-grading'

describe('monthNumber / isExactMonth', () => {
  it('reads numbers, short and full month names', () => {
    expect(monthNumber('3')).toBe(3)
    expect(monthNumber('Mar')).toBe(3)
    expect(monthNumber('september')).toBe(9)
    expect(monthNumber('xyz')).toBeNull()
    expect(monthNumber('ma')).toBeNull()
  })
  it('matches the exact month by number or name', () => {
    expect(isExactMonth('7', 7)).toBe(true)
    expect(isExactMonth('Jul', 7)).toBe(true)
    expect(isExactMonth('Jun', 7)).toBe(false)
    expect(isExactMonth('7', undefined)).toBe(false)
  })
})

describe('isExactPosition', () => {
  it('compares against the 1-based position and tolerates #', () => {
    expect(isExactPosition('3', 2)).toBe(true)
    expect(isExactPosition('#3', 2)).toBe(true)
    expect(isExactPosition('2', 2)).toBe(false)
    expect(isExactPosition('1', undefined)).toBe(false)
  })
})

describe('closestMatcher', () => {
  it('lets every tied nearest guess count', () => {
    const match = closestMatcher(['2', '4', '9'], 3, (t) => Number(t))
    expect(match('2')).toBe(true)
    expect(match('4')).toBe(true)
    expect(match('9')).toBe(false)
  })
  it('ignores guesses that are not numbers', () => {
    const match = closestMatcher(['abc', '5'], 5, (t) => (Number.isNaN(Number(t)) ? null : Number(t)))
    expect(match('abc')).toBe(false)
    expect(match('5')).toBe(true)
  })
})

describe('gradeGuesses', () => {
  const guesses = [
    { teamId: 'a', name: 'Ann', text: 'S' },
    { teamId: 'a', name: 'Ann2', text: 'S' },
    { teamId: 'b', name: 'Bo', text: 'A' },
  ]
  it('credits each team once per grade, however many guesses it sent', () => {
    const r = gradeGuesses(guesses, (t) => t === 'S', [{ credited: new Set(), points: 1, label: 'tier' }], { accuracy: true, multiplier: () => 1 })
    expect(r.deltas).toEqual({ a: 1 })
    expect(r.events.map((e) => e.isMatch)).toEqual([true, true, false])
  })
  it('skips teams already credited and stacks several grades', () => {
    const r = gradeGuesses(
      guesses,
      (t) => t === 'S',
      [
        { credited: new Set(['a']), points: 2, label: 'closest' },
        { credited: new Set(), points: 3, label: 'exact' },
      ],
      { accuracy: false, multiplier: () => 1 },
    )
    expect(r.deltas).toEqual({ a: 3 })
    expect(r.events[0].isMatch).toBeNull()
    expect(r.nextSets[0].has('a')).toBe(true)
  })
  it('applies a team\'s multiplier and says so in the label', () => {
    const r = gradeGuesses(guesses, (t) => t === 'S', [{ credited: new Set(), points: 2, label: 'tier' }], { accuracy: true, multiplier: (id) => (id === 'a' ? 2 : 1) })
    expect(r.deltas).toEqual({ a: 4 })
    expect(r.earned.a).toEqual(['2x tier'])
  })
})
