import { expect, it } from 'vitest'
import { canSubmit, groupWinnings, normalizePhone, parseReceipt, parseWinnings } from '../../src/features/winnerContacts/winnerContacts'

const week = '2026-11-02'
const base = { winnerId: 1, weekStart: week, eventType: 'RAFFLE', place: 1, prizeName: '1등 상품',
  announcedAt: '2026-11-09T00:00:00Z', submissionDeadline: '2026-11-16T00:00:00Z',
  contactStatus: 'NOT_SUBMITTED', maskedPhone: null, contactExpiresAt: null }

it('shows only validated award fields and groups multiple wins into one weekly contact', () => {
  const awards = parseWinnings([base, { ...base, winnerId: 2, eventType: 'JUMPMAP', prizeName: '점프맵 상품',
    privatePhone: '01012345678' }])
  expect(awards[1]).not.toHaveProperty('privatePhone')
  const weeks = groupWinnings(awards)
  expect(weeks).toHaveLength(1)
  expect(weeks[0]?.awards).toHaveLength(2)
  expect(weeks[0]?.status).toBe('NOT_SUBMITTED')
  expect(() => parseWinnings([{ ...base, eventType: 'UNKNOWN' }])).toThrow()
  expect(() => parseWinnings([{ ...base, contactStatus: 'SUBMITTED', maskedPhone: 1012345678 }])).toThrow()
})

it('accepts the server phone formats and enforces the announced submission deadline', () => {
  expect(normalizePhone('010-1234-5678')).toBe('01012345678')
  expect(normalizePhone('011 123 4567')).toBe('0111234567')
  expect(normalizePhone('010-123-4567')).toBeNull()
  expect(canSubmit('NOT_SUBMITTED', base.submissionDeadline, Date.parse(base.submissionDeadline) - 1)).toBe(true)
  expect(canSubmit('NOT_SUBMITTED', base.submissionDeadline, Date.parse(base.submissionDeadline))).toBe(false)
  expect(canSubmit('EXPIRED', base.submissionDeadline, Date.parse(base.submissionDeadline) - 1)).toBe(false)
  expect(parseReceipt({ weekStart: week, status: 'SUBMITTED', maskedPhone: '***-****-5678',
    expiresAt: '2026-11-23T00:00:00Z', submissionDeadline: base.submissionDeadline }, week).maskedPhone)
    .toBe('***-****-5678')
})
