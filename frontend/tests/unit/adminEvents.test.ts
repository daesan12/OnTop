import { expect, it } from 'vitest'
import {
  isMondayWeek, parseAdminWinners, parseDeliveryReceipt, parseEventRound, parseRaffleReview, parseRevealedContact,
  schedule, supportsWeek,
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
    winners: [{ userId: 5, nickname: '돼지병아리', ticketNumber: 12, place: 1, prizeName: '1등 상품' }],
  }, 'raffle', week)
  expect(result).toMatchObject({ candidateCount: 4, excludedGmCount: 1, awardedPrizeCount: 1 })
  expect(result.winners[0]?.evidence).toBe('응모권 #12')
  expect(result.winners[0]?.nickname).toBe('돼지병아리')
})

it('parses a persisted review and rejects an inconsistent attempt', () => {
  const review = { drawId: 7, weekStartDate: week, announcesAt: '2026-11-09T00:00:00Z',
    attemptNumber: 2, status: 'REVIEW', requestedByUserId: 101, rerollReason: '운영 검토',
    drawnAt: '2026-11-09T00:10:00Z', candidateCount: 4, excludedGmCount: 1,
    expectedPrizeCount: 8, awardedPrizeCount: 1, vacantPrizeCount: 7,
    picks: [{ userId: 5, nickname: '당첨자', raffleTicketId: 30, ticketNumber: 12,
      place: 1, slotNumber: 1, prizeName: '1등 상품' }],
  }
  expect(parseRaffleReview(review, week)).toMatchObject({ drawId: 7, attemptNumber: 2,
    picks: [{ nickname: '당첨자', evidence: '응모권 #12' }] })
  expect(() => parseRaffleReview({ ...review, status: 'SUPERSEDED' }, week)).toThrow()
  expect(() => parseRaffleReview({ ...review, vacantPrizeCount: 0 }, week)).toThrow()
  expect(() => parseRaffleReview({ ...review, drawId: Number.MAX_SAFE_INTEGER + 1 }, week)).toThrow()
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
    nickname: '점프왕', eventType: 'JUMPMAP', place: 1, prizeName: '상품', contactStatus: 'SUBMITTED',
    maskedPhone: '010-****-5678', contactExpiresAt: '2026-11-23T00:00:00Z',
    deliveryStatus: 'PENDING', deliveredByUserId: null, deliveredAt: null,
    unexpectedPrivateField: 'should-not-pass',
  }], limit: 20, offset: 0, hasMore: false })
  expect(page.winners[0]).not.toHaveProperty('unexpectedPrivateField')
  expect(page.winners[0]?.nickname).toBe('점프왕')
  expect(page.winners[0]?.deliveryStatus).toBe('PENDING')
  expect(parseRevealedContact({ winnerId: 1, phone: '01012345678', expiresAt: '2026-11-23T00:00:00Z' }).phone)
    .toBe('01012345678')
  expect(() => parseRevealedContact({ winnerId: 1, phone: 'bad', expiresAt: '2026-11-23T00:00:00Z' })).toThrow()
})

it('accepts weekly minigame winners in the contact administration list', () => {
  const types = ['MG_MOLE', 'MG_SPEED_MOLE', 'MG_JUMP_ROPE', 'MG_JUMPMAP_220'] as const
  const winners = types.map((eventType, index) => ({
    winnerId: index + 10, userId: index + 20, weekStart: week, nickname: '당첨자', eventType,
    place: 1, prizeName: '미니게임 1등상', contactStatus: 'NOT_SUBMITTED', maskedPhone: null,
    contactExpiresAt: null, deliveryStatus: 'PENDING', deliveredByUserId: null, deliveredAt: null,
  }))
  expect(parseAdminWinners({ winners, limit: 20, offset: 0, hasMore: false }).winners
    .map(winner => winner.eventType)).toEqual(types)
})

it('validates per-award delivery state and the protected PUT receipt', () => {
  const pending = { winnerId: 1, userId: 5, nickname: '점프왕', weekStart: week,
    eventType: 'JUMPMAP', place: 1, prizeName: '상품', contactStatus: 'NOT_SUBMITTED',
    maskedPhone: null, contactExpiresAt: null, deliveryStatus: 'PENDING',
    deliveredByUserId: null, deliveredAt: null }
  const delivered = { ...pending, deliveryStatus: 'DELIVERED', deliveredByUserId: 9,
    deliveredAt: '2026-11-16T00:00:00Z' }
  const page = { winners: [pending, delivered], limit: 20, offset: 0, hasMore: false }
  expect(parseAdminWinners(page).winners[1]?.deliveredByUserId).toBe(9)
  expect(() => parseAdminWinners({ ...page, winners: [{ ...delivered, deliveredAt: null }] })).toThrow()
  const receipt = { winnerId: 1, userId: 5, deliveryStatus: 'DELIVERED',
    deliveredByUserId: 9, deliveredAt: '2026-11-16T00:00:00Z', alreadyDelivered: false }
  expect(parseDeliveryReceipt(receipt, 1, 5).alreadyDelivered).toBe(false)
  expect(() => parseDeliveryReceipt(receipt, 1, 6)).toThrow()
})
