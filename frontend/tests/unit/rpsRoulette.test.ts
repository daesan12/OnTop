import { describe, expect, it, vi } from 'vitest'
import { RpsRouletteService } from '../../src/features/rpsRoulette/service'
import { parseRpsState, payoutRange, ROULETTE } from '../../src/features/rpsRoulette/protocol'
import { statusLine } from '../../src/features/rpsRoulette/presentation'
import { LED_SHAPES, HANDS } from '../../src/features/rpsRoulette/ledHands'
import { RestError } from '../../src/network/restError'

const rules = { fees: [10, 20, 30], dailyPlays: 15, multipliers: [1, 1.5, 2], roulette: [...ROULETTE],
  duelLimitMs: 5000, decideLimitMs: 10000, graceMs: 1500 }
const duelRound = { id: '17', fee: 20, phase: 'DUEL', seq: 1, stakeLevel: 0, multiplier: 1, challenging: false, duelNo: 1,
  commitment: 'a'.repeat(64), inputEndsAt: '2026-11-01T03:00:05Z', deadlineAt: '2026-11-01T03:00:06.500Z', lastDuel: null,
  outcome: null, rouletteCell: null, rouletteValue: null, payout: 0, startedAt: '2026-11-01T03:00:00Z', settledAt: null }
const state = (round: unknown = duelRound) => ({ serverNow: '2026-11-01T03:00:00Z', availableBalance: 80, playedToday: 1, rules, round })

function fixture() {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const request = vi.fn().mockResolvedValue(state())
  let next = 0
  const service = new RpsRouletteService(request, { owner: () => 'member-1', storage: () => storage, newKey: () => `key${++next}` })
  return { values, request, service }
}

describe('rps roulette contract', () => {
  it('keeps the agreed 30-cell roulette and the 600냥 maximum', () => {
    expect(ROULETTE).toHaveLength(30)
    expect(ROULETTE.filter(cell => cell === 1)).toHaveLength(19)
    expect(ROULETTE.reduce((sum, cell) => sum + cell, 0)).toBe(61)
    expect(payoutRange(30, 2)).toEqual([60, 600])
  })
  it('parses the server state and rejects a settled round without an outcome', () => {
    expect(parseRpsState(state()).round?.phase).toBe('DUEL')
    expect(() => parseRpsState(state({ ...duelRound, phase: 'SETTLED' }))).toThrow()
  })
  it('defines a dotted outline for every hand and the idle coin', () => {
    for (const hand of [...HANDS, 'COIN'] as const) expect(LED_SHAPES[hand].outline.length).toBeGreaterThan(20)
  })
})

describe('rps roulette service', () => {
  it('sends the fee with an idempotency key and clears it after the receipt', async () => {
    const f = fixture()
    await f.service.start(20)
    expect(f.request).toHaveBeenCalledWith('/api/v1/minigames/rps-roulette/rounds', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key1' }, body: '{"fee":20}',
    })
    expect(f.values.size).toBe(0)
  })
  it('reuses the uncertain START key for the same fee so a lost response is not charged twice', async () => {
    const f = fixture()
    f.request.mockRejectedValueOnce(new TypeError('response lost'))
    await expect(f.service.start(20)).rejects.toMatchObject({ retryable: true })
    await f.service.start(20)
    expect(f.request.mock.calls.map(call => call[1].headers['Idempotency-Key'])).toEqual(['key1', 'key1'])
  })
  it('forgets a rejected START and explains the business reason', async () => {
    const f = fixture()
    f.request.mockRejectedValueOnce(new RestError(409, 'RPS_DAILY_LIMIT', 'rejected'))
    await expect(f.service.start(10)).rejects.toMatchObject({ retryable: false, code: 'RPS_DAILY_LIMIT' })
    expect(f.values.size).toBe(0)
  })
  it('sends the viewed sequence with each action', async () => {
    const f = fixture()
    await f.service.hand('17', 3, 'PAPER')
    expect(f.request).toHaveBeenLastCalledWith('/api/v1/minigames/rps-roulette/rounds/17/hands',
      expect.objectContaining({ method: 'POST', body: '{"seq":3,"hand":"PAPER"}' }))
  })
})

describe('rps roulette presentation', () => {
  const base = { busy: null, error: '', revealing: false, spinning: false, timeUp: false, playsLeft: 14 }
  it('asks for a hand while the duel is open and waits for the server after the time limit', () => {
    const round = parseRpsState(state()).round
    expect(statusLine({ ...base, round })).toContain('5초')
    expect(statusLine({ ...base, round, timeUp: true })).toContain('서버 판정')
  })
  it('shows the server payout formula after the roulette', () => {
    const round = parseRpsState(state({ ...duelRound, phase: 'SETTLED', outcome: 'PAID', stakeLevel: 1, multiplier: 1.5,
      rouletteCell: 15, rouletteValue: 7, payout: 210, inputEndsAt: null, deadlineAt: null, settledAt: '2026-11-01T03:00:09Z' })).round
    expect(statusLine({ ...base, round })).toContain('20냥 × 7칸 × 1.5 = 210냥')
  })
  it('separates a failed challenge from a first-duel loss', () => {
    const settled = { ...duelRound, phase: 'SETTLED', outcome: 'LOST', inputEndsAt: null, deadlineAt: null, settledAt: '2026-11-01T03:00:09Z' }
    expect(statusLine({ ...base, round: parseRpsState(state({ ...settled, challenging: true })).round })).toContain('도전 실패')
    expect(statusLine({ ...base, round: parseRpsState(state(settled)).round })).toContain('졌어요')
  })
})
