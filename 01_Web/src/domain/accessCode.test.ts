import { describe, expect, it } from 'vitest'
import { isAccessCodeCorrect, normalizeAccessCode } from './accessCode'

describe('isAccessCodeCorrect', () => {
  it('accepts the access code', () => {
    expect(isAccessCodeCorrect('9397')).toBe(true)
  })

  it('accepts the code with surrounding whitespace', () => {
    expect(isAccessCodeCorrect('  9397 \n')).toBe(true)
  })

  it('rejects anything that is not the code', () => {
    for (const candidate of ['', '   ', '939', '93970', '0397', '93 97', 'password']) {
      expect(isAccessCodeCorrect(candidate)).toBe(false)
    }
  })

  it('rejects a code that differs only by digit order', () => {
    expect(isAccessCodeCorrect('9739')).toBe(false)
    expect(isAccessCodeCorrect('3997')).toBe(false)
  })
})

describe('normalizeAccessCode', () => {
  it('trims the input', () => {
    expect(normalizeAccessCode('  12 34  ')).toBe('12 34')
  })
})
