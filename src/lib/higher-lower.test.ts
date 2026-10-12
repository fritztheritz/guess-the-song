import { describe, expect, it } from 'vitest'
import { buildHigherLowerRounds, correctAnswer, isCorrectGuess, parseGuess, rankSongs, rechainRounds } from './higher-lower'
import { createEmptyTierList, type TierList } from '../types/tierlist'
import { moveSong } from './tierlist-ranking'

// 5 songs: s0,s1 in S, s2 in A, s3 in B, s4 unranked.
function sample(): TierList {
  let l = createEmptyTierList('T')
  l.songs = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, soundcloudTrackId: `${i}`, title: `Song ${i}`, artist: 'X', tierId: null, order: i }))
  l = moveSong(l, 's0', l.tiers[0].id, null)
  l = moveSong(l, 's1', l.tiers[0].id, null)
  l = moveSong(l, 's2', l.tiers[1].id, null)
  l = moveSong(l, 's3', l.tiers[2].id, null)
  return l
}

describe('rankSongs', () => {
  it('numbers ranked songs best-first across tiers and skips unranked ones', () => {
    const r = rankSongs(sample())
    expect(r.get('s0')).toMatchObject({ rank: 1, size: 4, tierName: 'S' })
    expect(r.get('s1')?.rank).toBe(2)
    expect(r.get('s2')).toMatchObject({ rank: 3, tierName: 'A' })
    expect(r.get('s3')?.rank).toBe(4)
    expect(r.has('s4')).toBe(false)
  })
})

describe('buildHigherLowerRounds', () => {
  it('makes one round per song after the opening card, each comparing with the song before', () => {
    const l = sample()
    const order = ['s2', 's0', 's3', 's1'].map((id) => l.songs.find((s) => s.id === id)!)
    const rounds = buildHigherLowerRounds(order, l)
    expect(rounds.map((r) => r.title)).toEqual(['Song 0', 'Song 3', 'Song 1'])
    expect(rounds[0].higherLower).toMatchObject({ rank: 1, size: 4, ref: { title: 'Song 2', rank: 3 } })
    expect(rounds[1].higherLower?.ref).toMatchObject({ title: 'Song 0', rank: 1 })
  })

  it('skips unranked songs and continues from an existing last round', () => {
    const l = sample()
    const song = (id: string) => l.songs.find((s) => s.id === id)!
    const first = buildHigherLowerRounds([song('s0'), song('s2')], l)
    const more = buildHigherLowerRounds([song('s4'), song('s3')], l, first[first.length - 1])
    expect(more).toHaveLength(1)
    expect(more[0].higherLower?.ref.title).toBe('Song 2')
  })

  it('needs at least two ranked songs to make a round', () => {
    const l = sample()
    expect(buildHigherLowerRounds([l.songs.find((s) => s.id === 's0')!], l)).toEqual([])
  })
})

describe('rechainRounds', () => {
  it('re-links references after a reorder, leaving the opening card alone', () => {
    const l = sample()
    const rounds = buildHigherLowerRounds(['s0', 's1', 's2', 's3'].map((id) => l.songs.find((s) => s.id === id)!), l)
    const swapped = rechainRounds([rounds[1], rounds[0], rounds[2]])
    expect(swapped[0].higherLower?.ref).toEqual(rounds[1].higherLower?.ref)
    expect(swapped[1].higherLower?.ref.title).toBe(rounds[1].title)
    expect(swapped[2].higherLower?.ref.title).toBe(rounds[0].title)
  })
})

describe('answers', () => {
  it('is "higher" when the song outranks the reference', () => {
    expect(correctAnswer({ rank: 2, ref: { rank: 5 } })).toBe('higher')
    expect(correctAnswer({ rank: 7, ref: { rank: 5 } })).toBe('lower')
  })
  it('reads guesses loosely', () => {
    expect(parseGuess(' Higher ')).toBe('higher')
    expect(parseGuess('L')).toBe('lower')
    expect(parseGuess('maybe')).toBeNull()
    expect(isCorrectGuess('lower', { rank: 7, ref: { rank: 5 } })).toBe(true)
    expect(isCorrectGuess('higher', { rank: 7, ref: { rank: 5 } })).toBe(false)
  })
})
