import { describe, expect, it, vi } from 'vitest'
import { RaffleService } from '../../src/features/raffle/service'
import { drawBlock, LIVE_EVENT_WEEK, liveEventSchedule, parseCurrent, parsePurchase, schedule, ticketCells } from '../../src/features/raffle/protocol'
import { RestError } from '../../src/network/restError'

const current = (patch: Record<string, unknown> = {}) => ({ roundId: 3, weekStartDate: '2026-11-02', salesStatus: 'OPEN',
  salesStartsAt: '2026-11-02T00:00:00Z', salesEndsAt: '2026-11-08T15:00:00Z', ticketPrice: 100, weeklyLimit: 10,
  purchasedCount: 2, remainingCount: 8, balance: 800, reservedBalance: 100, availableBalance: 700,
  tickets: [{ ticketId: 13, ticketNumber: 3140, purchasedAt: '2026-11-02T00:30:00Z' },
    { ticketId: 14, ticketNumber: 8271, purchasedAt: '2026-11-02T00:31:00Z' }], ...patch })
const receipt = { ticketId: 15, roundId: 3, ticketNumber: 15, purchasePrice: 100, purchasedAt: '2026-11-02T00:40:00Z',
  balanceAfter: 600, purchasedCount: 3, remainingCount: 7 }

function fixture(request = vi.fn().mockResolvedValue(receipt)) {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  let next = 0
  const service = new RaffleService(request, { owner: () => 'member-1', storage: () => storage, newKey: () => `key${++next}` })
  return { values, request, service }
}

describe('weekly raffle contract', () => {
  it('parses the handoff example and rejects inconsistent wallets or ticket counts', () => {
    expect(parseCurrent(current()).tickets.map(t => t.ticketNumber)).toEqual([3140, 8271])
    expect(parsePurchase(receipt).ticketNumber).toBe(15)
    expect(() => parseCurrent(current({ availableBalance: 800 }))).toThrow()
    expect(() => parseCurrent(current({ purchasedCount: 3 }))).toThrow()
    expect(() => parseCurrent(current({ salesStatus: 'PAUSED' }))).toThrow()
    expect(() => parsePurchase({ ...receipt, ticketNumber: 10001 })).toThrow()
  })

  it('gives every own ticket its own board cell, probing past collisions', () => {
    expect(ticketCells([1, 241, 240, 15])).toEqual([0, 1, 239, 14])
    expect(new Set(ticketCells(Array.from({ length: 10 }, () => 7))).size).toBe(10)
  })

  it('explains why the draw button is unavailable before the server decides', () => {
    const data = parseCurrent(current())
    const open = Date.parse('2026-11-03T00:00:00Z')
    expect(drawBlock(data, open)).toBeNull()
    expect(drawBlock(parseCurrent(current({ salesStatus: 'SCHEDULED' })), open)).toBe('scheduled')
    expect(drawBlock(data, Date.parse('2026-11-08T15:00:00Z'))).toBe('closed')
    expect(drawBlock(parseCurrent(current({ remainingCount: 0 })), open)).toBe('limit')
    expect(drawBlock(parseCurrent(current({ balance: 199, reservedBalance: 100, availableBalance: 99 })), open)).toBe('balance')
  })

  it('draws at Monday 00:00 KST after the last sale minute and announces at 09:00', () => {
    const times = schedule(parseCurrent(current()))
    expect(new Date(times.lastSale).toISOString()).toBe('2026-11-08T14:59:00.000Z')
    expect(new Date(times.draw).toISOString()).toBe('2026-11-08T15:00:00.000Z')
    expect(new Date(times.announce).toISOString()).toBe('2026-11-09T00:00:00.000Z')
  })
})

describe('2026-11-19 public live draw schedule', () => {
  const eventRound = (patch: Record<string, unknown> = {}) => parseCurrent(current({ weekStartDate: LIVE_EVENT_WEEK,
    salesStartsAt: '2026-11-16T00:00:00Z', salesEndsAt: '2026-11-18T15:00:00Z', ...patch }))

  it('shows one extended sales period and the afternoon public announcement only for the 11/16 round', () => {
    expect(liveEventSchedule(eventRound())).toEqual({
      sales: '11월 9일(월) ~ 11월 18일(수) 23:59',
      announce: '11월 19일(목) 오후 탑골공원에서 공개 추첨행사',
      revealNotice: '11월 19일(목) 오후 탑골공원 공개 추첨행사에서 당첨 번호를 발표해요.',
      limitHint: '이번 주 뽑기권을 모두 뽑았어요. 11월 19일(목) 오후 공개 추첨행사를 기다려 주세요!',
    })
  })

  it('never shows a computed 09:00 or guessed announcement time, even before the server deadline moves', () => {
    for (const salesEndsAt of ['2026-11-18T15:00:00Z', '2026-11-22T15:00:00Z']) {
      const live = liveEventSchedule(eventRound({ salesEndsAt }))!
      for (const text of [live.announce, live.revealNotice, live.limitHint]) {
        expect(text).toContain('11월 19일(목) 오후')
        expect(text).not.toMatch(/\d{1,2}:\d{2}|오전|9시|14시/)
      }
      expect(live.sales).not.toContain('11월 16일')
    }
  })

  it('keeps the weekly schedule for other rounds', () => {
    for (const weekStartDate of ['2026-11-02', '2026-11-09', '2026-11-23']) {
      expect(liveEventSchedule({ weekStartDate })).toBeNull()
    }
    const next = schedule(parseCurrent(current({ weekStartDate: '2026-11-23',
      salesStartsAt: '2026-11-23T00:00:00Z', salesEndsAt: '2026-11-29T15:00:00Z' })))
    expect(new Date(next.lastSale).toISOString()).toBe('2026-11-29T14:59:00.000Z')
    expect(new Date(next.announce).toISOString()).toBe('2026-11-30T00:00:00.000Z')
  })

  it('still lets the server sales window decide whether the event round can be bought', () => {
    expect(drawBlock(eventRound(), Date.parse('2026-11-18T14:59:59.999Z'))).toBeNull()
    expect(drawBlock(eventRound(), Date.parse('2026-11-18T15:00:00Z'))).toBe('closed')
    expect(drawBlock(eventRound({ remainingCount: 0 }), Date.parse('2026-11-17T00:00:00Z'))).toBe('limit')
  })
})

describe('weekly raffle purchase', () => {
  it('sends one Idempotency-Key per purchase and forgets it after success', async () => {
    const { request, service, values } = fixture()
    await expect(service.purchase()).resolves.toMatchObject({ ticketNumber: 15 })
    expect(request).toHaveBeenCalledWith('/api/v1/raffles/current/tickets',
      { cache: 'no-store', method: 'POST', headers: { 'Idempotency-Key': 'key1' } })
    expect(values.size).toBe(0)
    await service.purchase()
    expect(request.mock.calls[1]![1].headers['Idempotency-Key']).toBe('key2')
  })

  it('reuses the same key after a lost response so the server returns the first ticket', async () => {
    const request = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(receipt)
    const { service } = fixture(request)
    await expect(service.purchase()).rejects.toMatchObject({ retryable: true })
    await service.purchase()
    expect(request.mock.calls.map(call => call[1].headers['Idempotency-Key'])).toEqual(['key1', 'key1'])
  })

  it('drops the key after a decided rejection and shows the business message', async () => {
    const request = vi.fn().mockRejectedValueOnce(new RestError(409, 'RAFFLE_WEEKLY_LIMIT_REACHED', 'x')).mockResolvedValue(receipt)
    const { service } = fixture(request)
    await expect(service.purchase()).rejects.toMatchObject({ retryable: false, message: expect.stringContaining('모두 뽑았어요') })
    await service.purchase()
    expect(request.mock.calls[1]![1].headers['Idempotency-Key']).toBe('key2')
  })

  it('retries RAFFLE_UNAVAILABLE with the same key but not RAFFLE_NOT_CONFIGURED', async () => {
    const unavailable = fixture(vi.fn().mockRejectedValue(new RestError(503, 'RAFFLE_UNAVAILABLE', 'x')))
    await expect(unavailable.service.purchase()).rejects.toMatchObject({ retryable: true })
    expect(unavailable.values.size).toBe(1)
    const missing = fixture(vi.fn().mockRejectedValue(new RestError(503, 'RAFFLE_NOT_CONFIGURED', 'x')))
    await expect(missing.service.purchase()).rejects.toMatchObject({ retryable: false })
    expect(missing.values.size).toBe(0)
  })
})
