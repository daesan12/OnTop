import { describe, expect, it, vi } from 'vitest'
import { PREVIEW_RULES, previewSchedule } from '../../src/features/mole/preview'
import { KEY_CODES, KEYS, parseMoleRound, parseMoleSettlement, parseMoleState, type Hit, type Mole } from '../../src/features/mole/protocol'
import { MoleScorer, scoreHits } from '../../src/features/mole/scoring'
import { MoleService } from '../../src/features/mole/service'
import { RestError } from '../../src/network/restError'

const rules = PREVIEW_RULES
const mole = (id: number, hole: number, kind: Mole['kind'], hits: number, appearAt: number, leaveAt: number): Mole =>
  ({ id, hole, kind, hits, appearAt, leaveAt })

describe('whack-a-mole scoring (same records as backend MoleRulesTests)', () => {
  it('scores normal, gold, rapid, decoy and empty hits like the server', () => {
    const moles = [mole(0, 0, 'NORMAL', 1, 0, 900), mole(1, 1, 'GOLD', 1, 0, 450), mole(2, 2, 'RAPID', 3, 1000, 2100),
      mole(3, 3, 'DECOY', 1, 1000, 1900)]
    const hits: Hit[] = [{ hole: 0, at: 150 }, { hole: 1, at: 120 }, { hole: 1, at: 200 }, { hole: 2, at: 1050 }, { hole: 2, at: 1150 },
      { hole: 2, at: 1180 }, { hole: 2, at: 1250 }, { hole: 2, at: 1400 }, { hole: 3, at: 1500 }, { hole: 5, at: 1600 }]
    expect(scoreHits(moles, rules, hits)).toEqual({ score: 50, maxCombo: 3, caught: 3, coins: 1 })
  })

  it('multiplies by 1.2 / 1.5 / 2 from combo 10 / 20 / 30 and an empty hole breaks the combo', () => {
    const moles = Array.from({ length: 35 }, (_, i) => mole(i, i % 8, 'NORMAL', 1, i * 1000, i * 1000 + 900))
    const hits = moles.map(m => ({ hole: m.hole, at: m.appearAt + 200 }))
    expect(scoreHits(moles, rules, hits).score).toBe(9 * 10 + 10 * 12 + 10 * 15 + 6 * 20)
    const broken = scoreHits(moles, rules, [...hits, { hole: 7, at: 9500 }])
    expect(broken.maxCombo).toBe(25)
    expect(broken.score).toBe(9 * 10 + 12 + 9 * 10 + 10 * 12 + 6 * 15)
  })

  it('reports each hit so the screen can show taps left and the combo', () => {
    const scorer = new MoleScorer([mole(0, 4, 'RAPID', 2, 0, 900)], rules)
    expect(scorer.hit(4, 150)).toMatchObject({ type: 'tap', left: 1 })
    expect(scorer.hit(4, 180)).toEqual({ type: 'ignored' })
    expect(scorer.hit(4, 260)).toMatchObject({ type: 'catch', points: 20, tenths: 10 })
    expect(scorer.hit(4, 400)).toEqual({ type: 'empty', comboBroken: false })
    expect(scorer.hit(4, 700)).toEqual({ type: 'empty', comboBroken: true })
  })

  it('maps keys by physical position so the Korean input mode does not matter', () => {
    expect(KEYS.join('')).toBe('QWERUIOP')
    expect(KEY_CODES).toEqual(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyU', 'KeyI', 'KeyO', 'KeyP'])
  })
})

describe('whack-a-mole schedule preview', () => {
  it('keeps one mole per hole, the phase limits and rapid caps 3 / 4 / 5', () => {
    const moles = previewSchedule(1234)
    for (const m of moles) {
      const phase = Math.min(2, Math.floor(m.appearAt / 30000))
      expect(moles.filter(o => o.appearAt <= m.appearAt && o.leaveAt > m.appearAt).length).toBeLessThanOrEqual([2, 3, 4][phase]!)
      expect(moles.some(o => o !== m && o.hole === m.hole && o.appearAt < m.leaveAt && m.appearAt < o.leaveAt)).toBe(false)
      if (m.kind === 'RAPID') expect(m.hits).toBeLessThanOrEqual(3 + phase)
    }
    expect(moles.length).toBeGreaterThan(120)
  })
})

describe('whack-a-mole contract', () => {
  const state = { serverNow: '2026-11-04T03:00:00Z', todayEarned: 120, dailyCap: 500, bestScore: 1380, rules, last: null }
  it('parses status, round and settlement and rejects broken data', () => {
    expect(parseMoleState(state).todayEarned).toBe(120)
    expect(() => parseMoleState({ ...state, rules: { ...rules, keys: ['A'] } })).toThrow()
    const round = { id: '7', startedAt: '2026-11-04T03:00:00Z', rules, moles: [mole(0, 2, 'RAPID', 3, 700, 1800)] }
    expect(parseMoleRound(round).moles[0]).toMatchObject({ kind: 'RAPID', hits: 3 })
    expect(() => parseMoleRound({ ...round, moles: [{ ...round.moles[0], hole: 8 }] })).toThrow()
    expect(() => parseMoleRound({ ...round, moles: [{ ...round.moles[0], kind: 'BOSS' }] })).toThrow()
    const result = { id: '7', score: 1380, maxCombo: 24, caught: 96, calculatedReward: 46, reward: 46, settledAt: '2026-11-04T03:01:33Z' }
    expect(parseMoleSettlement({ result, todayEarned: 166, dailyCap: 500, bestScore: 1380 }).result.reward).toBe(46)
  })

  it('starts with only an idempotency key, reuses it after a lost response and posts hits on complete', async () => {
    const values = new Map<string, string>()
    const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v) },
      removeItem: (k: string) => { values.delete(k) } }
    const round = { id: '7', startedAt: '2026-11-04T03:00:00Z', rules, moles: [] }
    const request = vi.fn().mockRejectedValueOnce(new TypeError('lost')).mockResolvedValue(round)
    let next = 0
    const service = new MoleService(request, { owner: () => 'member-1', storage: () => storage, newKey: () => `key${++next}` })

    await expect(service.start()).rejects.toMatchObject({ retryable: true })
    await service.start()
    expect(request.mock.calls.map(call => call[1].headers['Idempotency-Key'])).toEqual(['key1', 'key1'])
    expect(values.size).toBe(0)

    request.mockResolvedValueOnce({ result: { id: '7', score: 30, maxCombo: 1, caught: 1, calculatedReward: 1, reward: 1,
      settledAt: '2026-11-04T03:01:33Z' }, todayEarned: 1, dailyCap: 500, bestScore: 30 })
    await service.complete('7', [{ hole: 1, at: 500 }])
    expect(request).toHaveBeenLastCalledWith('/api/v1/minigames/whack-a-mole/rounds/7/complete',
      expect.objectContaining({ method: 'POST', body: '{"hits":[{"hole":1,"at":500}]}' }))
  })

  it('explains a finished round that came back too late', async () => {
    const service = new MoleService(vi.fn().mockRejectedValue(new RestError(409, 'MOLE_ROUND_EXPIRED', 'x')),
      { owner: () => 'member-1', storage: () => sessionStorage, newKey: () => 'k' })
    await expect(service.complete('7', [])).rejects.toMatchObject({ retryable: false, message: '시간이 지나 끝난 판이에요. 새로 시작해 주세요.' })
  })
})
