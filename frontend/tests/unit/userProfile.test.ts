import { describe, it, expect } from 'vitest'
import { userProfile } from '../../src/network/protocol'

describe('approved USER-01 profile contract', () => {
  it('maps the server identity and both character genders without wallet fields', () => {
    expect(
      userProfile({
        userId: 101,
        nickname: '산책자',
        characterGender: 'FEMALE',
      }),
    ).toEqual({ userId: '101', nickname: '산책자', character: 'girl' })
    expect(
      userProfile({ userId: 101, nickname: '산책자', characterGender: 'MALE' })
        .character,
    ).toBe('man')
  })
  it.each([
    { userId: '101', nickname: '산책자', characterGender: 'MALE' },
    { userId: 0, nickname: '산책자', characterGender: 'MALE' },
    { userId: 101, nickname: '', characterGender: 'MALE' },
    { userId: 101, nickname: '산책자', characterGender: 'OTHER' },
  ])('rejects an incompatible profile response', (value) => {
    expect(() => userProfile(value)).toThrow()
  })
})
