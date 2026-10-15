import { describe, expect, it } from 'vitest'
import { rarityFor } from './player-card'

describe('rarityFor', () => {
  it('climbs with wins', () => {
    expect([0, 1, 2, 3, 5, 6, 20].map(rarityFor)).toEqual(['bench', 'starter', 'starter', 'allstar', 'allstar', 'holo', 'holo'])
  })
})
