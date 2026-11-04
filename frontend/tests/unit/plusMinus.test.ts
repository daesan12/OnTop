import { describe, expect, it, vi } from 'vitest'
import { PlusMinusService } from '../../src/features/plusMinus/service'
import { FIRST_REEL, JACKPOT, OPERATOR_REEL, parsePlusMinusState, SECOND_REEL } from '../../src/features/plusMinus/protocol'
import { formula, resultLine, statusLine } from '../../src/features/plusMinus/presentation'
import { landingCell, landingTimeline, spinningCell } from '../../src/features/plusMinus/reels'
import { RestError } from '../../src/network/restError'

const rules = { fee: 30, dailyPlays: 10, firstReel: [...FIRST_REEL], operatorReel: [...OPERATOR_REEL], secondReel: [...SECOND_REEL],
  pointPayout: 10, jackpotFirst: 7, jackpotPayout: 500 }
const paid = { id: '17', firstCell: 0, operatorCell: 0, secondCell: 12, first: 7, operator: '+', second: 5, result: 12,
  outcome: 'PAID', payout: 120, playedAt: '2026-11-03T03:00:00Z' }
const state = (round: unknown = paid) => ({ serverNow: '2026-11-03T03:00:00Z', availableBalance: 190, playedToday: 1, rules, round })

function fixture() {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const request = vi.fn().mockResolvedValue(state())
  let next = 0
  const service = new PlusMinusService(request, { owner: () => 'member-1', storage: () => storage, newKey: () => `key${++next}` })
  return { values, request, service }
}

describe('plus minus contract', () => {
  it('keeps the agreed reels: 16 numbers, 8 signs and one JACKPOT cell', () => {
    expect(FIRST_REEL).toHaveLength(16)
    expect(OPERATOR_REEL.filter(sign => sign === '+')).toHaveLength(4)
    expect(SECOND_REEL).toHaveLength(16)
    expect(SECOND_REEL.filter(value => value === JACKPOT)).toHaveLength(1)
    expect(SECOND_REEL[paid.secondCell]).toBe(5)
  })
  it('parses a settled round and rejects cells outside the reels', () => {
    expect(parsePlusMinusState(state()).round).toMatchObject({ first: 7, operator: '+', second: 5, payout: 120 })
    expect(parsePlusMinusState(state(null)).round).toBeNull()
    expect(() => parsePlusMinusState(state({ ...paid, secondCell: 16 }))).toThrow()
    expect(() => parsePlusMinusState(state({ ...paid, outcome: 'WIN' }))).toThrow()
  })
  it('writes the formula and result line from server values only', () => {
    const round = parsePlusMinusState(state()).round!
    expect(formula(round)).toBe('7 + 5 = 12')
    expect(resultLine(round)).toBe('7 + 5 = 12 → 120냥')
    const jackpot = { ...round, operator: '-' as const, second: JACKPOT, result: null, outcome: 'JACKPOT' as const, payout: 500 }
    expect(resultLine(jackpot)).toBe('7 − JACKPOT! 대박 500냥')
    expect(resultLine({ ...jackpot, first: 5, outcome: 'LOST', payout: 0 })).toBe('5 − JACKPOT · 7이 아니라 꽝')
    expect(statusLine({ round: null, busy: null, error: '', spinning: 2, playsLeft: 9 })).toMatch(/^2번 정지/)
    expect(statusLine({ round: null, busy: null, error: '', spinning: 0, playsLeft: 0 })).toMatch(/10판을 모두/)
  })
})

describe('plus minus stop buttons', () => {
  it('slides from the pressed cell onto the server cell, adding a lap when it is too close', () => {
    const far = landingTimeline(2, 10, 16)
    expect(far.steps).toBe(8)
    expect(landingCell(far, 16, far.duration)).toBe(10)
    const near = landingTimeline(9, 10, 16)
    expect(near.steps).toBe(17)
    expect(landingCell(near, 16, 0)).toBe(9)
    expect(landingCell(near, 16, near.duration + 100)).toBe(10)
    expect(near.duration).toBeLessThan(1500)
    expect(spinningCell(0, 16, 0)).not.toBe(spinningCell(2, 16, 0))
  })
})

describe('plus minus service', () => {
  it('starts without a body and clears the idempotency key after the receipt', async () => {
    const f = fixture()
    await f.service.start()
    expect(f.request).toHaveBeenCalledWith('/api/v1/minigames/plus-minus/rounds', { method: 'POST', headers: { 'Idempotency-Key': 'key1' } })
    expect(f.values.size).toBe(0)
  })
  it('reuses the uncertain START key so a lost response is not charged twice', async () => {
    const f = fixture()
    f.request.mockRejectedValueOnce(new TypeError('response lost'))
    await expect(f.service.start()).rejects.toMatchObject({ retryable: true })
    await f.service.start()
    expect(f.request.mock.calls.map(call => call[1].headers['Idempotency-Key'])).toEqual(['key1', 'key1'])
  })
  it('forgets a rejected START and explains the business reason', async () => {
    const f = fixture()
    f.request.mockRejectedValueOnce(new RestError(409, 'PLUS_MINUS_DAILY_LIMIT', 'rejected'))
    await expect(f.service.start()).rejects.toMatchObject({ retryable: false, message: '오늘 10판을 모두 했어요. 내일 다시 만나요.' })
    expect(f.values.size).toBe(0)
  })
})
