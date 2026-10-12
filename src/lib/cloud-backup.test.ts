import { describe, expect, it } from 'vitest'
import { CLOUD_CODE_PATTERN, formatBackupCode, generateBackupCode, normalizeBackupCode } from './cloud-backup'

describe('backup codes', () => {
  it('are long, random and match what the Worker accepts', () => {
    const a = generateBackupCode()
    expect(a).toMatch(CLOUD_CODE_PATTERN)
    expect(a).not.toBe(generateBackupCode())
    expect(a).not.toMatch(/[01OIL]/)
  })
  it('read back tolerantly from what a person types', () => {
    const code = generateBackupCode()
    expect(normalizeBackupCode(formatBackupCode(code).toLowerCase() + ' ')).toBe(code)
  })
  it('group in fours for reading aloud', () => {
    expect(formatBackupCode('ABCDEFGHJK')).toBe('ABCD-EFGH-JK')
  })
})
