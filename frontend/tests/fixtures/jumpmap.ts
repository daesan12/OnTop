import { COURSE_VERSION, MAP_VERSION, RULES_VERSION, kstDate } from '../../src/features/jumpmap/course'
import type { JumpStatus } from '../../src/features/jumpmap/protocol'

/** Other game tests model a server where the optional course has not been enabled. */
export function disabledJumpmapStatus(channelId: string, mapVersion: string = MAP_VERSION): JumpStatus {
  return { channelId, mapVersion, revision: 0, enabled: false, courseVersion: COURSE_VERSION, rulesVersion: RULES_VERSION,
    isFirstRun: false, seenTips: [], activeRunId: null, activeRun: null, bestFinishMs: null,
    dailyCap: 100, todayEarned: 0, earningsDate: kstDate() }
}
