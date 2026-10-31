import { beforeEach, describe, expect, it } from 'vitest'
import { acceptJumpEvent, applyJumpStatus, bindJumpmap, closeJumpCompletion, resetJumpmap, useJumpmap } from '../../src/features/jumpmap/state'
import { COURSE_VERSION, MAP_VERSION, RULES_VERSION, kstDate } from '../../src/features/jumpmap/course'
const scope = { channelId: 'channel-1', mapVersion: MAP_VERSION }
const money = { earningsDate: kstDate(), dailyCap: 100, todayEarned: 0 }
const start = (runId = 'run-a', revision = 1) => acceptJumpEvent({ type: 'JUMPMAP_STARTED', ...scope, ...money,
  revision, runId, courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION, serverTime: 123456 }, 1000)
beforeEach(() => {
  resetJumpmap(); bindJumpmap('101', 'channel-1', MAP_VERSION)
  applyJumpStatus({ ...scope, ...money, revision: 0, enabled: true, courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION,
    isFirstRun: true, seenTips: [], activeRunId: null, bestFinishMs: null }, 1000)
})
describe('repeat jumpmap feedback', () => {
  it('starts on server first landing and immediately accepts another run after falling', () => {
    expect(useJumpmap.getState().run).toBeNull()
    start()
    expect(useJumpmap.getState()).toMatchObject({ run: { runId: 'run-a' }, completion: null, banner: null })
    acceptJumpEvent({ type: 'JUMPMAP_ENDED', ...scope, ...money, revision: 2, runId: 'run-a', reason: 'FALL',
      gatesPassed: 1, maxHeight: 12, elapsedMs: 15000, runCoins: 2, todayEarned: 2 }, 2000)
    start('run-b', 3)
    expect(useJumpmap.getState()).toMatchObject({ run: { runId: 'run-b', runCoins: 0 }, result: null, completion: null })
  })
  it('opens the final-pad sheet once, closes without reward changes and never reopens on duplicate landing', () => {
    start()
    acceptJumpEvent({ type: 'JUMPMAP_FINAL_PAD', ...scope, revision: 2, runId: 'run-a' }, 2000)
    expect(useJumpmap.getState().completion).toEqual({ runId: 'run-a' })
    expect(useJumpmap.getState().todayEarned).toBe(0)
    acceptJumpEvent({ type: 'JUMPMAP_FINAL_PAD', ...scope, revision: 3, runId: 'run-a' }, 2900)
    expect(useJumpmap.getState().completion).toEqual({ runId: 'run-a' })
    closeJumpCompletion()
    expect(useJumpmap.getState()).toMatchObject({ completion: null, todayEarned: 0, run: { finalReached: true } })
    acceptJumpEvent({ type: 'JUMPMAP_FINAL_PAD', ...scope, revision: 4, runId: 'run-a' }, 3000)
    expect(useJumpmap.getState().completion).toBeNull()
    acceptJumpEvent({ type: 'JUMPMAP_ENDED', ...scope, ...money, revision: 5, runId: 'run-a', reason: 'FINISH',
      gatesPassed: 7, maxHeight: 47, elapsedMs: 200000, finishMs: 200000, runCoins: 100, todayEarned: 100 }, 4000)
    expect(useJumpmap.getState().completion).toBeNull()
    expect(useJumpmap.getState().todayEarned).toBe(100)
  })
  it('never replays completion on recovery or from FINISH alone', () => {
    applyJumpStatus({ ...scope, ...money, revision: 4, enabled: true, courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION,
      isFirstRun: false, seenTips: [], activeRunId: 'run-a', bestFinishMs: null,
      activeRun: { runId: 'run-a', gatesPassed: 6, finalReached: true, elapsedMs: 90000, maxHeight: 47, runCoins: 64 } }, 5000)
    acceptJumpEvent({ type: 'JUMPMAP_FINAL_PAD', ...scope, revision: 5, runId: 'run-a' }, 6000)
    expect(useJumpmap.getState().completion).toBeNull()
    acceptJumpEvent({ type: 'JUMPMAP_ENDED', ...scope, ...money, revision: 6, runId: 'run-a', reason: 'FINISH',
      gatesPassed: 7, maxHeight: 47, elapsedMs: 200000, finishMs: 200000, runCoins: 100, todayEarned: 100 }, 7000)
    expect(useJumpmap.getState()).toMatchObject({ completion: null, run: null, todayEarned: 100 })
  })
})
