import { expect, it } from 'vitest'
import {
  isMondayWeek, parseAdminWinners, parseEventRound, parseRevealedContact, schedule, supportsWeek,
} from '../../src/features/admin/adminEvents'

const week = '2026-11-02'

it('accepts only a real KST Monday and keeps each event within its configured week', () => {
  expect(isMondayWeek(week)).toBe(true)
  expect(isMondayWeek('2026-11-03')).toBe(false)
  expect(isMondayWeek('2026-02-30')).toBe(false)
  expect(schedule(week, 'raffle').eligibleAt).toBe('2026-11-09T00:00:00+09:00')
  expect(schedule(week, 'jumpmap').eligibleAt).toBe('2026-11-09T00:05:00+09:00')
  expect(supportsWeek('jumpmap', '2026-11-09')).toBe(false)
  expect(supportsWeek('asset', '2026-11-09')).toBe(true)
})

it('parses finalized raffle counts and preserves winner evidence', () => {
  const result = parseEventRound({ weekStartDate: week, announcesAt: '2026-11-09T00:00:00Z',
    finalized: true, candidateCount: 4, excludedGmCount: 1,
    expectedPrizeCount: 8, awardedPrizeCount: 1, vacantPrizeCount: 7,
    winners: [{ userId: 5, ticketNumber: 12, place: 1, prizeName: '1등 상품' }],
  }, 'raffle', week)
  expect(result).toMatchObject({ candidateCount: 4, excludedGmCount: 1, awardedPrizeCount: 1 })
  expect(result.winners[0]?.evidence).toBe('응모권 #12')
})

it('rejects inconsistent draw totals and malformed contact list responses', () => {
  expect(() => parseEventRound({ weekStartDate: week, announcesAt: '2026-11-09T00:00:00Z',
    finalized: true, expectedPrizeCount: 8, awardedPrizeCount: 1, vacantPrizeCount: 0,
    winners: [],
  }, 'raffle', week)).toThrow()
  expect(() => parseAdminWinners({ winners: [{ winnerId: 1, phone: '01012345678' }],
    limit: 20, offset: 0, hasMore: false })).toThrow()
})

it('maps only masked contact data into the listing and validates explicitly revealed data', () => {
  const page = parseAdminWinners({ winners: [{ winnerId: 1, userId: 5, weekStart: week,
    eventType: 'JUMPMAP', place: 1, prizeName: '상품', contactStatus: 'SUBMITTED',
    maskedPhone: '010-****-5678', contactExpiresAt: '2026-11-23T00:00:00Z',
    unexpectedPrivateField: 'should-not-pass',
  }], limit: 20, offset: 0, hasMore: false })
  expect(page.winners[0]).not.toHaveProperty('unexpectedPrivateField')
  expect(parseRevealedContact({ winnerId: 1, phone: '01012345678', expiresAt: '2026-11-23T00:00:00Z' }).phone)
    .toBe('01012345678')
  expect(() => parseRevealedContact({ winnerId: 1, phone: 'bad', expiresAt: '2026-11-23T00:00:00Z' })).toThrow()
})
