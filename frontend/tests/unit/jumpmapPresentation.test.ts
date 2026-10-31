import { beforeEach, describe, expect, it } from 'vitest'
import { acceptJumpEvent, applyJumpStatus, bindJumpmap, closeJumpCompletion, resetJumpmap, useJumpmap } from '../../src/features/jumpmap/state'
import { COURSE_VERSION, MAP_VERSION, RULES_VERSION, kstDate } from '../../src/features/jumpmap/course'
const scope = { channelId: 'channel-1', mapVersion: MAP_VERSION }
const money = { earningsDate: kstDate(), dailyCap: 500, todayEarned: 0 }
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
  it('opens once on authoritative finish, keeps the server time and ignores duplicates', () => {
    start()
    acceptJumpEvent({ type: 'JUMPMAP_FINAL_PAD', ...scope, revision: 2, runId: 'run-a' }, 2000)
    expect(useJumpmap.getState().completion).toBeNull()
    const finish = { type: 'JUMPMAP_ENDED', ...scope, ...money, revision: 3, runId: 'run-a', reason: 'FINISH',
      gatesPassed: 7, maxHeight: 47, elapsedMs: 200123, finishMs: 200123, runCoins: 100, todayEarned: 100 } as const
    acceptJumpEvent(finish, 3000)
    expect(useJumpmap.getState()).toMatchObject({ completion: { runId: 'run-a' }, result: { finishMs: 200123 }, run: null })
    closeJumpCompletion()
    acceptJumpEvent(finish, 4000)
    expect(useJumpmap.getState().completion).toBeNull()
  })
  it('shows the return-to-first-pad hint for only 1.5 seconds on each fall', () => {
    start()
    acceptJumpEvent({ type: 'JUMPMAP_ENDED', ...scope, ...money, revision: 2, runId: 'run-a', reason: 'FALL',
      gatesPassed: 1, maxHeight: 12, elapsedMs: 15000, runCoins: 2 }, 2000)
    expect(useJumpmap.getState().tip).toMatchObject({ text: '첫 발판으로 돌아가 다시 도전해요', until: 3500 })
  })
})
