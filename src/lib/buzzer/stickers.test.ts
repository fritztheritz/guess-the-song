import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STICKERS } from './protocol'

// The phone protocol's sticker list and the Worker's whitelist are two copies of the same set; this keeps them
// from drifting (a sticker the Worker doesn't know is silently dropped).
describe('sticker list parity', () => {
  const worker = readFileSync(new URL('../../../worker/src/buzzer-room.js', import.meta.url), 'utf8')
  const line = worker.split('\n').find((l) => l.startsWith('const STICKERS = new Set('))!

  it('the Worker accepts exactly the stickers the app offers', () => {
    const inWorker = [...line.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort()
    expect(inWorker).toEqual(STICKERS.map((s) => s.id).sort())
  })
})
