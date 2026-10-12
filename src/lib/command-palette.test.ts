import { describe, expect, it } from 'vitest'
import { rankCommands, type Command } from './command-palette'

const c = (id: string, label: string, kind = 'Game', keywords = ''): Command => ({ id, label, kind, keywords, to: `/${id}`, icon: '•' })

describe('rankCommands', () => {
  const cmds = [c('a', 'Friday Night Music Game'), c('b', 'Party Mix', 'Tier list'), c('c', 'New game', 'Action', 'create'), c('d', 'Stats', 'Page')]

  it('returns everything (in order) for an empty query', () => {
    expect(rankCommands(cmds, '').map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('requires every word to match and ignores case', () => {
    expect(rankCommands(cmds, 'FRIDAY game').map((x) => x.id)).toEqual(['a'])
    expect(rankCommands(cmds, 'zzz')).toEqual([])
  })

  it('ranks label-start matches above later matches, and finds keywords and kinds', () => {
    const two = [c('x', 'Friday Game'), c('y', 'Game Night')]
    expect(rankCommands(two, 'game').map((r) => r.id)).toEqual(['y', 'x'])
    expect(rankCommands(cmds, 'create').map((x) => x.id)).toEqual(['c'])
    expect(rankCommands(cmds, 'tier').map((x) => x.id)).toEqual(['b'])
  })
})
