import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JUMP_SEQUENCE } from '../../src/layout-preview/jumpCourse'
import { COURSE, COURSE_COLLIDERS, COURSE_VERSION, MAP_VERSION, RULES_VERSION, expectedCoins, kstDate, targetFade } from '../../src/features/jumpmap/course'
import { parseJumpEvent, parseJumpStatus, type JumpStatus } from '../../src/features/jumpmap/protocol'
import { acceptJumpEvent, anticipateGate, applyJumpStatus, bindJumpmap, onStep, presentStep, receiveJumpmap, resetJumpmap, showTip, useJumpmap } from '../../src/features/jumpmap/state'
import { JumpGrace } from '../../src/features/jumpmap/jumpGrace'

const scope = { channelId: 'channel-1', mapVersion: MAP_VERSION }
const earnings = () => ({ earningsDate: kstDate(), todayEarned: 0, dailyCap: 500 })
const status = (patch: Partial<JumpStatus> = {}): JumpStatus => ({ ...scope, ...earnings(), revision: 0, enabled: true, courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, isFirstRun: true, seenTips: [], activeRunId: null, bestFinishMs: null, ...patch })
const emit = (type: string, revision: number, p: object = {}) => acceptJumpEvent(parseJumpEvent(type, { ...scope, ...earnings(), revision, runId: 'run-a', ...p })!, 1000 + revision)
const start = (revision = 1, runId = 'run-a') => emit('JUMPMAP_STARTED', revision, { runId, courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, serverTime: Date.now() })
beforeEach(() => { resetJumpmap(); bindJumpmap('101', 'channel-1', MAP_VERSION); applyJumpStatus(status(), 1000) })
afterEach(() => vi.useRealTimers())

describe('accepted new-map course', () => {
  it('reuses every source pad without rescaling and exports top-aligned thin colliders', () => {
    expect(COURSE).toHaveLength(113); expect(COURSE.filter(p => p.gate)).toHaveLength(6)
    COURSE.forEach((p, i) => {
      const source = JUMP_SEQUENCE[i]!
      expect([p.id, p.x, p.z, p.top, p.thickness, p.yaw]).toEqual([source.id, source.x, source.z, source.height, source.thickness, source.yaw])
      const c = COURSE_COLLIDERS[i]!
      expect(c.center[1]! + c.half[1]!).toBeCloseTo(p.top, 8)
      expect(c.camera).toBe(false)
    })
    expect(COURSE_COLLIDERS.filter(c => c.stage === 6 && !c.gate).every(c => c.thickness === .05 && c.yaw === 0)).toBe(true)
  })
  it('caps expected receipts and uses Korea midnight', () => {
    expect(expectedCoins(7, 495)).toBe(5); expect(expectedCoins(7, 500)).toBe(0)
    expect(kstDate(Date.parse('2026-10-30T14:59:59Z'))).toBe('2026-10-30')
    expect(kstDate(Date.parse('2026-10-30T15:00:00Z'))).toBe('2026-10-31')
  })
  it('keeps occupied high pads visible and independently clears the view of the avatar', () => {
    expect(targetFade(14.9, 0, false, false, false)).toBe(1)
    expect(targetFade(45, 0, false, false, false)).toBe(.15)
    expect(targetFade(45, 0, true, true, false)).toBe(.6)
    expect(targetFade(45, 45, true, true, true)).toBe(.25)
    expect(targetFade(61, 45, true, false, false)).toBe(.15)
  })
})
describe('server-owned run projection', () => {
  it('never converts a predicted gate into coins or run progress', () => {
    start(); anticipateGate(1, 1100)
    expect(useJumpmap.getState()).toMatchObject({ todayEarned: 0, walletRevision: 0, run: { gatesPassed: 0, runCoins: 0 }, popup: { anticipated: true, amount: 2 } })
    emit('JUMPMAP_GATE', 2, { gate: 1, elapsedMs: 10000, coinsCalculated: 2, coinsGranted: null, pending: true, runCoins: 0 })
    expect(useJumpmap.getState()).toMatchObject({ todayEarned: 0, run: { gatesPassed: 1, runCoins: 0 }, walletRevision: 0 })
    emit('JUMPMAP_GATE_SETTLED', 3, { gate: 1, coinsGranted: 2, runCoins: 2, todayEarned: 2 })
    emit('JUMPMAP_GATE_SETTLED', 3, { gate: 1, coinsGranted: 2, runCoins: 2, todayEarned: 2 })
    expect(useJumpmap.getState()).toMatchObject({ todayEarned: 2, run: { runCoins: 2 }, walletRevision: 1 })
  })
  it('applies late settlements without replacing a subsequent run', () => {
    start(); emit('JUMPMAP_ENDED', 2, { reason: 'FALL', gatesPassed: 1, elapsedMs: 18000, maxHeight: 18, runCoins: 0 })
    start(3, 'run-b')
    emit('JUMPMAP_GATE_SETTLED', 4, { gate: 1, coinsGranted: 2, runCoins: 2, todayEarned: 2 })
    expect(useJumpmap.getState()).toMatchObject({ run: { runId: 'run-b', runCoins: 0 }, todayEarned: 2 })
    start(5, 'run-a'); expect(useJumpmap.getState().run?.runId).toBe('run-b')
  })
  it('recovers the active timer and ignores older REST responses, other maps and other channels', () => {
    applyJumpStatus(status({ revision: 5, activeRunId: 'recover', activeRun: { runId: 'recover', elapsedMs: 5000, gatesPassed: 3, finalReached: false, maxHeight: 35, runCoins: 13 } }), 10000)
    expect(useJumpmap.getState().run?.startedAt).toBe(5000)
    applyJumpStatus(status({ revision: 4 }), 11000)
    expect(useJumpmap.getState().run?.runId).toBe('recover')
    emit('JUMPMAP_STARTED', 6, { channelId: 'foreign', courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, serverTime: Date.now() })
    emit('JUMPMAP_STARTED', 6, { mapVersion: 'f'.repeat(64), courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, serverTime: Date.now() })
    expect(useJumpmap.getState().run?.runId).toBe('recover')
    applyJumpStatus(status({ revision: 6, courseVersion: 'wrong' })); expect(useJumpmap.getState().available).toBe(false)
  })
  it('shows authoritative finish records, ignores duplicates and resets on identity changes', () => {
    start(); emit('JUMPMAP_ENDED', 2, { reason: 'FINISH', gatesPassed: 7, elapsedMs: 123456, maxHeight: 47, runCoins: 100, todayEarned: 100, finishMs: 123456, bestFinishMs: 123456, newBest: true })
    expect(useJumpmap.getState()).toMatchObject({ run: null, todayEarned: 100, bestFinishMs: 123456, result: { reason: 'FINISH', newBest: true } })
    bindJumpmap('102', 'channel-1', MAP_VERSION)
    expect(useJumpmap.getState()).toMatchObject({ run: null, result: null, todayEarned: null, available: false, seenTips: [] })
  })
  it('does not carry yesterday earnings across midnight or retry recursively', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-30T15:00:01Z'))
    applyJumpStatus(status({ todayEarned: 99, earningsDate: '2026-10-30' }))
    expect(useJumpmap.getState()).toMatchObject({ todayEarned: null, earningsDate: '2026-10-31', refresh: 0 })
  })
  it('isolates malformed feature events and rejects invalid settlement values', () => {
    expect(() => receiveJumpmap('JUMPMAP_GATE', {}, '101', 'channel-1', MAP_VERSION)).not.toThrow()
    expect(useJumpmap.getState().refresh).toBe(1)
    expect(() => parseJumpStatus(status({ todayEarned: 501 }))).toThrow()
    expect(() => emit('JUMPMAP_GATE', 2, { gate: 1, elapsedMs: 2, coinsCalculated: 2, coinsGranted: 3, pending: false, runCoins: 3 })).toThrow()
    expect(parseJumpEvent('JUMPMAP_FUTURE_EVENT', {})).toBeNull()
  })
  it('deduplicates predicted/server landings and once-only guidance', () => {
    const fn = vi.fn(), stop = onStep(fn)
    presentStep(0, '101', 1, 1000); presentStep(0, '101', 1, 1100); presentStep(0, '101', 1, 1200)
    expect(fn).toHaveBeenCalledTimes(2); stop()
    expect(showTip('FIRST_FALL')).toBe(true); expect(showTip('FIRST_FALL')).toBe(false)
  })
})
describe('v2 jump grace', () => {
  it('allows a single jump within three 30 Hz coyote ticks and expires afterward', () => {
    const grace = new JumpGrace(); grace.reset(true)
    grace.step(false, false, 2 / 30); expect(grace.step(true, false, 1 / 60)).toBe(true)
    expect(grace.step(true, false, 1 / 60)).toBe(false)
    grace.reset(true); grace.step(false, false, 3 / 30); expect(grace.step(true, false, 1 / 60)).toBe(false)
  })
  it('buffers one input for four server ticks and restores replay counters', () => {
    const grace = new JumpGrace(); grace.reset(false)
    expect(grace.step(true, false, 2 / 30)).toBe(false); expect(grace.step(false, true, 1 / 60)).toBe(true)
    grace.reset(false); grace.step(true, false, 4 / 30); expect(grace.step(false, true, 1 / 60)).toBe(false)
    grace.reset(false, { coyoteTicks: 1, jumpBufferTicks: 1 }); expect(grace.step(false, false, 1 / 60)).toBe(true)
  })
})
