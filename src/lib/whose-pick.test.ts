import { describe, expect, it } from 'vitest'
import { addToTallies, awardsFrom, buildOrder, canStart, claimedTags, ownerTag, pickers, scoreSong, togglePick, type Claims } from './whose-pick'

const claim = (claims: Claims, id: string, name: string, limit = 3) => togglePick(claims, id, { name }, limit)

describe('togglePick', () => {
  it('claims a free song, releases your own, and refuses someone else\'s', () => {
    let r = claim({}, 's1', 'Ann')
    expect(r.outcome).toBe('claimed')
    expect(claim(r.claims, 's1', 'bo').outcome).toBe('taken')
    expect(claim(r.claims, 's1', ' ANN ').outcome).toBe('released')
  })

  it('stops at the pick limit', () => {
    let c: Claims = {}
    for (const id of ['a', 'b']) c = claim(c, id, 'Ann', 2).claims
    expect(claim(c, 'c', 'Ann', 2).outcome).toBe('limit')
    // releasing frees a slot
    c = claim(c, 'a', 'Ann', 2).claims
    expect(claim(c, 'c', 'Ann', 2).outcome).toBe('claimed')
  })
})

describe('pickers / canStart / buildOrder', () => {
  const claims: Claims = {
    s1: { key: 'ann', name: 'Ann' },
    s2: { key: 'ann', name: 'Ann' },
    s3: { key: 'bo', name: 'Bo' },
    s4: { key: 'bo', name: 'Bo' },
  }
  it('lists each picker once with their count', () => {
    expect(pickers(claims).map((p) => [p.name, p.count])).toEqual([['Ann', 2], ['Bo', 2]])
  })
  it('needs enough songs and at least two pickers', () => {
    expect(canStart(claims)).toBe(true)
    expect(canStart({ s1: claims.s1, s2: claims.s1, s3: claims.s1, s4: claims.s1 })).toBe(false)
    const { s4: _, ...three } = claims
    expect(canStart(three)).toBe(false)
  })
  it('orders every claimed song exactly once', () => {
    expect(buildOrder(claims).sort()).toEqual(['s1', 's2', 's3', 's4'])
  })
  it('tags are stable, case-insensitive and never the name itself', () => {
    expect(ownerTag('Ann')).toBe(ownerTag(' ann '))
    expect(ownerTag('Ann')).not.toBe(ownerTag('Bo'))
    expect(Object.values(claimedTags(claims))).not.toContain('Ann')
  })
})

describe('scoreSong', () => {
  const owner = { key: 'ann', teamId: 'A' }
  const g = (key: string, teamId: string, guessKey: string) => ({ key, name: key, teamId, guessKey })

  it('right guesses score for the guesser, fooled rivals score for the owner', () => {
    const s = scoreSong(owner, [g('bo', 'B', 'ann'), g('cy', 'B', 'dee'), g('di', 'C', 'bo')])
    expect(s.right.map((x) => x.key)).toEqual(['bo'])
    expect(s.wrong.map((x) => x.key)).toEqual(['cy', 'di'])
    expect(s.gains).toEqual({ B: 1, A: 2 })
  })

  it('a teammate guessing wrong fools no one, and the owner never scores themself', () => {
    const s = scoreSong(owner, [g('ed', 'A', 'bo'), g('ann', 'A', 'ann')])
    expect(s.wrong).toHaveLength(1)
    expect(s.fooled).toHaveLength(0)
    expect(s.gains).toEqual({})
  })
})

describe('tallies and awards', () => {
  it('accumulates and crowns the leaders', () => {
    const owner = { key: 'ann', name: 'Ann' }
    const s = scoreSong({ key: 'ann', teamId: 'A' }, [
      { key: 'bo', name: 'Bo', teamId: 'B', guessKey: 'ann' },
      { key: 'cy', name: 'Cy', teamId: 'B', guessKey: 'bo' },
    ])
    const t = addToTallies({}, owner, s)
    expect(t.bo.correct).toBe(1)
    expect(t.cy.wrong).toBe(1)
    expect(t.ann.fooled).toBe(1)
    const a = awardsFrom(t)
    expect(a.detective?.name).toBe('Bo')
    expect(a.disguise?.name).toBe('Ann')
    expect(awardsFrom({}).detective).toBeNull()
  })
})
