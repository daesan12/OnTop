import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENVIRONMENT, sampleDay } from '../../src/config/environment'

afterEach(() => { vi.useRealTimers(); vi.resetModules() })

describe('shared Korean-time fallback world day', () => {
  it('anchors the existing 30-minute game cycle to midnight in Asia/Seoul', () => {
    expect(ENVIRONMENT.timeZone).toBe('Asia/Seoul')
    expect(ENVIRONMENT.epochMs).toBe(Date.parse('2026-01-01T00:00:00+09:00'))
    expect(ENVIRONMENT.epochMs).toBe(Date.UTC(2025, 11, 31, 15))
    expect(ENVIRONMENT.dayDurationMs).toBe(30 * 60_000)
    expect(sampleDay(ENVIRONMENT.epochMs).hour).toBe(0)
    expect(sampleDay(ENVIRONMENT.epochMs + 15 * 60_000).hour).toBe(12)
    expect(sampleDay(ENVIRONMENT.epochMs + 30 * 60_000).hour).toBe(0)
  })
  it('gives late joins the same phase and continues after a hidden-tab gap', async () => {
    vi.useFakeTimers()
    const at = ENVIRONMENT.epochMs + ENVIRONMENT.dayDurationMs * 0.2
    vi.setSystemTime(at)
    vi.resetModules()
    const first = await import('../../src/world/environmentState')
    await vi.advanceTimersByTimeAsync(180_000)
    vi.resetModules()
    const late = await import('../../src/world/environmentState')
    first.updateEnvironmentFrame(performance.now())
    late.updateEnvironmentFrame(performance.now())
    expect(first.environmentFrame.serverTime).toBe(at + 180_000)
    expect(late.environmentFrame.hour).toBeCloseTo(first.environmentFrame.hour)
    expect(late.environmentFrame.daylight).toBe(first.environmentFrame.daylight)
    await vi.advanceTimersByTimeAsync(600_000)
    first.updateEnvironmentFrame(performance.now())
    late.updateEnvironmentFrame(performance.now())
    expect(late.environmentFrame.hour).toBeCloseTo(sampleDay(at + 780_000).hour)
    expect(late.environmentFrame.hour).toBeCloseTo(first.environmentFrame.hour)
  })

  it('ignores device clock changes during play and allows an authoritative clock', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(ENVIRONMENT.epochMs)
    vi.resetModules()
    const state = await import('../../src/world/environmentState')
    vi.setSystemTime(ENVIRONMENT.epochMs + 600_000)
    await vi.advanceTimersByTimeAsync(1000)
    state.updateEnvironmentFrame(performance.now())
    expect(state.environmentFrame.serverTime).toBe(ENVIRONMENT.epochMs + 1000)
    const serverTime = ENVIRONMENT.epochMs + 900_000
    state.environmentClock.sync(serverTime, performance.now())
    state.updateEnvironmentFrame(performance.now())
    expect(state.environmentFrame.serverTime).toBe(serverTime)
  })
})
