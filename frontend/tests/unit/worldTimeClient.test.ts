import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorldTimeClient, parseWorldTime } from '../../src/network/worldTimeClient'
import { environmentClock, environmentConfig, resetEnvironmentTime } from '../../src/world/environmentState'
import { ENVIRONMENT } from '../../src/config/environment'
import type { Envelope } from '../../src/network/protocol'

const base = Date.parse('2026-10-27T03:00:00+09:00')
const sample = (serverNow = base) => ({ serverNow, cycleEpochMs: ENVIRONMENT.epochMs,
  cycleDurationMs: ENVIRONMENT.dayDurationMs, timeZone: 'Asia/Seoul' })
let now: number, doc: EventTarget & { hidden: boolean }, client: WorldTimeClient
let requests: { type: string; payload: object; expected: readonly string[]; id: string;
  resolve: (value: Envelope) => void; reject: (error: Error) => void }[]
const reply = async (index: number, payload: object) => {
  const pending = requests[index]!
  pending.resolve({ requestId: pending.id, type: 'WORLD_TIME_STATE', payload: { ...payload } })
  await Promise.resolve(); await Promise.resolve()
}
const visibility = (hidden: boolean) => { doc.hidden = hidden; doc.dispatchEvent(new Event('visibilitychange')) }
beforeEach(() => {
  vi.useFakeTimers()
  now = 0; requests = []
  doc = Object.assign(new EventTarget(), { hidden: false })
  vi.stubGlobal('document', doc)
  resetEnvironmentTime()
  client = new WorldTimeClient({ now: () => now,
    request: (type, payload, expected, onId) => new Promise((resolve, reject) => {
      const id = 'clock-' + (requests.length + 1); onId(id)
      requests.push({ type, payload, expected, id, resolve, reject })
    }) })
})
afterEach(() => { client.reset(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('authenticated world time contract and lifecycle', () => {
  it('validates integer Unix ms, a positive cycle and the agreed Korean time zone', () => {
    expect(parseWorldTime(sample())).toEqual(sample())
    for (const patch of [{ serverNow: NaN }, { serverNow: -1 }, { serverNow: .5 },
      { cycleEpochMs: Infinity }, { cycleDurationMs: 0 }, { cycleDurationMs: '1800000' }, { timeZone: 'UTC' }])
      expect(() => parseWorldTime({ ...sample(), ...patch })).toThrow()
  })
  it('uses CONNECTED provisionally, then estimates receipt time using monotonic RTT', async () => {
    vi.setSystemTime(base + 3_600_000) // Deliberately wrong device clock.
    client.begin(sample())
    expect(environmentClock.now(0)).toBe(base)
    expect(requests[0]).toMatchObject({ type: 'WORLD_TIME_CHECK', payload: {}, expected: ['WORLD_TIME_STATE'] })
    const pending = client.refresh()
    expect(requests).toHaveLength(1)
    now = 80
    await reply(0, sample(base + 40))
    await pending
    expect(environmentClock.now(now)).toBe(base + 80)
    expect(environmentConfig).toMatchObject({ timeZone: 'Asia/Seoul', epochMs: ENVIRONMENT.epochMs, dayDurationMs: 1_800_000 })
    expect(client.error).toBe('')
  })
  it('ignores samples spanning hidden tabs and immediately measures again on return', async () => {
    client.begin(sample())
    visibility(true)
    now = 600_000
    await vi.advanceTimersByTimeAsync(60_000)
    expect(requests).toHaveLength(1)
    visibility(false)
    expect(requests).toHaveLength(2)
    await reply(0, sample(base + 10_000_000))
    expect(environmentClock.now(now)).toBe(base + now)
    now += 40
    await reply(1, sample(base + now - 20))
    expect(environmentClock.now(now)).toBe(base + now)
  })
  it('resets connection ownership and never applies an old connection reply or error', async () => {
    client.begin(sample())
    client.reset()
    expect(environmentClock.ready).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    now = 100
    client.begin(sample(base + 100))
    await reply(0, sample(base + 9_000_000))
    expect(environmentClock.now(now)).toBe(base + 100)
    now = 140
    await reply(1, sample(base + 120))
    expect(environmentClock.now(now)).toBe(base + 140)
    client.reset()
    visibility(false); visibility(true)
    expect(requests).toHaveLength(2)
  })
  it('keeps a valid clock after malformed responses, rejection or a high RTT outlier', async () => {
    client.begin(sample())
    now = 20; await reply(0, sample(base + 10))
    now = 30; void client.refresh()
    now = 40; await reply(1, { ...sample(), timeZone: 'UTC' })
    expect(client.error).toContain('형식')
    expect(environmentClock.now(now)).toBe(base + 40)
    now = 50; void client.refresh()
    expect(client.ownsError({ type: 'ERROR', requestId: requests[2]!.id, payload: {} })).toBe(true)
    requests[2]!.reject(new Error('서버 시간 조회 실패'))
    await Promise.resolve(); await Promise.resolve()
    expect(client.error).toBe('서버 시간 조회 실패')
    now = 60; void client.refresh()
    now = 2000; await reply(3, { ...sample(base + 9_000_000), cycleEpochMs: 1 })
    expect(environmentClock.now(now)).toBe(base + now)
    expect(environmentConfig.epochMs).toBe(ENVIRONMENT.epochMs)
  })
  it('refreshes periodically only while visible and falls back when the server has no time data', async () => {
    client.begin()
    requests[0]!.reject(new Error('UNSUPPORTED_MESSAGE_TYPE'))
    await Promise.resolve(); await Promise.resolve()
    expect(environmentClock.ready).toBe(false)
    expect(client.error).toBe('UNSUPPORTED_MESSAGE_TYPE')
    now = 30_000
    await vi.advanceTimersByTimeAsync(30_000)
    expect(requests).toHaveLength(2)
    await reply(1, sample(base + now))
    expect(environmentClock.ready).toBe(true)
    expect(client.error).toBe('')
  })
})
