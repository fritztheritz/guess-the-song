import { describe, expect, it } from 'vitest'
import { MODE_RULES, balanceSpread, rulesFor } from './mode-rules'
import { SCORING } from './scoring'

describe('mode rules table', () => {
  it('defaults to the Song rules', () => {
    expect(rulesFor(undefined)).toBe(MODE_RULES.song)
  })

  it('only offers earned power-ups where power-ups exist', () => {
    for (const [mode, r] of Object.entries(MODE_RULES)) {
      if (r.earnedPowerUps) expect(r.powerUps, mode).toBe(true)
    }
  })

  it('every mode offers underdog catch-up', () => {
    for (const [mode, r] of Object.entries(MODE_RULES)) expect(r.catchUp, mode).toBe(true)
  })

  it('derives each mode\'s ceiling from the SCORING constants', () => {
    expect(MODE_RULES.tierguess.maxPerPossession).toBe(SCORING.tier + SCORING.position + SCORING.positionExact)
    expect(MODE_RULES.year.maxPerPossession).toBe(SCORING.year + SCORING.month + SCORING.monthExact)
    expect(MODE_RULES.popularity.maxPerPossession).toBe(SCORING.popularity + SCORING.maxStreakBonus)
  })

  // The balance guard: if a mixed game ever pits one mode against another, no mode's best possession
  // should be worth more than 2x another's. Re-tune SCORING (or this bound, deliberately) if it trips.
  it('keeps the modes within 2x of each other per possession', () => {
    expect(balanceSpread()).toBeLessThanOrEqual(2)
  })
})
