import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COURSE_VERSION, MAP_VERSION, RULES_VERSION, kstDate } from '../../src/features/jumpmap/course'
import { parseJumpEvent, parseJumpStatus, type JumpStatus, type LastRunView } from '../../src/features/jumpmap/protocol'
import { acceptJumpEvent, applyJumpStatus, bindJumpmap, resetJumpmap, useJumpmap } from '../../src/features/jumpmap/state'

const scope = { channelId: 'channel-1', mapVersion: MAP_VERSION }
const earnings = () => ({ earningsDate: kstDate(), todayEarned: 4, dailyCap: 1000 })
const status = (patch: Partial<JumpStatus> = {}): JumpStatus => ({ ...scope, ...earnings(), revision: 10, enabled: true, courseVersion: COURSE_VERSION,
  rulesVersion: RULES_VERSION, isFirstRun: false, seenTips: [], activeRunId: null, bestFinishMs: null, ...patch })
const last = (patch: Partial<LastRunView> = {}): LastRunView => ({ runId: 'gone', elapsedMs: 41000, gatesPassed: 2, finalReached: false,
  maxHeight: 21.5, runCoins: 6, reason: 'DISCONNECT', ...patch })
const emit = (type: string, revision: number, p: object = {}) =>
  acceptJumpEvent(parseJumpEvent(type, { ...scope, ...earnings(), revision, runId: 'gone', ...p })!, 1000 + revision)

/** 노드 테스트 환경에는 sessionStorage가 없다. 탭 저장소를 흉내 낸다. */
function storage() {
  const values = new Map<string, string>()
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v) }, removeItem: (k: string) => { values.delete(k) }, clear: () => values.clear() }
}

beforeEach(() => { vi.stubGlobal('sessionStorage', storage()); resetJumpmap(); bindJumpmap('101', 'channel-1', MAP_VERSION) })
afterEach(() => vi.unstubAllGlobals())

describe('ended run recovery after reconnect', () => {
  it('parses the optional lastRun and stays compatible without it', () => {
    expect(parseJumpStatus(status()).lastRun).toBeUndefined()
    expect(parseJumpStatus(status({ lastRun: null })).lastRun).toBeNull()
    expect(parseJumpStatus(status({ lastRun: last() })).lastRun?.reason).toBe('DISCONNECT')
    expect(() => parseJumpStatus(status({ lastRun: last({ reason: 'FINISH' }) }))).toThrow()
    expect(() => parseJumpStatus(status({ lastRun: last({ reason: 'NOPE' as never }) }))).toThrow()
    expect(parseJumpStatus(status({ lastRun: last({ reason: 'FINISH', gatesPassed: 7, finishMs: 250000, bestFinishMs: 250000, newBest: true }) })).lastRun?.newBest).toBe(true)
  })
  it('shows a run that ended while disconnected once, without tips or sounds', () => {
    applyJumpStatus(status({ lastRun: last() }), 5000)
    const s = useJumpmap.getState()
    expect(s.result).toMatchObject({ runId: 'gone', reason: 'DISCONNECT', runCoins: 6, recovered: true, until: 15000 })
    expect(s.walletRevision).toBe(1)
    // 같은 탭에서 재연결해도 같은 결과는 다시 띄우지 않는다.
    resetJumpmap(); bindJumpmap('101', 'channel-1', MAP_VERSION)
    applyJumpStatus(status({ revision: 11, lastRun: last() }), 6000)
    expect(useJumpmap.getState().result).toBeNull()
  })
  it('does not repeat a result already shown by the live JUMPMAP_ENDED event', () => {
    applyJumpStatus(status({ revision: 0 }), 1000)
    emit('JUMPMAP_STARTED', 1, { courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, serverTime: Date.now() })
    emit('JUMPMAP_ENDED', 2, { reason: 'FALL', gatesPassed: 1, elapsedMs: 18000, maxHeight: 18, runCoins: 2 })
    expect(useJumpmap.getState().result).toMatchObject({ runId: 'gone', reason: 'FALL' })
    expect(useJumpmap.getState().result?.recovered).toBeUndefined()
    resetJumpmap(); bindJumpmap('101', 'channel-1', MAP_VERSION)
    applyJumpStatus(status({ revision: 3, lastRun: last({ reason: 'FALL' }) }), 9000)
    expect(useJumpmap.getState().result).toBeNull()
  })
  it('prefers an active run and keeps late settlement on the recovered result only', () => {
    applyJumpStatus(status({ activeRunId: 'now', activeRun: { runId: 'now', elapsedMs: 1000, gatesPassed: 0, finalReached: false, maxHeight: 1, runCoins: 0 }, lastRun: last() }), 5000)
    expect(useJumpmap.getState()).toMatchObject({ run: { runId: 'now' }, result: null })

    resetJumpmap(); bindJumpmap('101', 'channel-1', MAP_VERSION)
    applyJumpStatus(status({ revision: 20, lastRun: last({ runId: 'late' }) }), 5000)
    emit('JUMPMAP_GATE_SETTLED', 21, { runId: 'late', gate: 3, coinsGranted: 7, runCoins: 13, todayEarned: 11 })
    expect(useJumpmap.getState()).toMatchObject({ result: { runId: 'late', runCoins: 13 }, todayEarned: 11 })
  })
  it('ignores lastRun when the jumpmap is unavailable', () => {
    applyJumpStatus(status({ enabled: false, lastRun: last() }), 5000)
    expect(useJumpmap.getState().result).toBeNull()
  })
})
