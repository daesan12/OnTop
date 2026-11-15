import { renewalMap } from '../../park/renewalMap'
import type { JumpPad as RenewalPad } from '../../../park-renewal-preview/jump10Plan'
import { containsPad } from '../../../park-renewal-preview/jumpPadFootprint'
import * as legacy from './course'

export { DAILY_CAP, STATUS_PATH, TIPS_PATH, kstDate, targetFade } from './course'
export const renewalCourse = renewalMap?.data.jumpCourse
export const COURSE_VERSION = renewalCourse?.courseVersion ?? legacy.COURSE_VERSION
export const RULES_VERSION = renewalCourse?.rulesVersion ?? legacy.RULES_VERSION
export const MAP_VERSION = renewalMap?.mapVersion ?? legacy.MAP_VERSION
export const START = renewalCourse?.start ?? legacy.START
export const FINISH = renewalCourse?.finish ?? legacy.FINISH
export const RETURN_TO = renewalCourse?.returnTo ?? legacy.RETURN_TO
export const GUIDE = renewalCourse?.guide ?? { ...START, radius: 2.4 }

export interface CourseBlock extends RenewalPad {
  block: number
  top: number
  ordinal: number
  thickness: number
}
export const COURSE: readonly CourseBlock[] = renewalCourse?.pads ?? legacy.COURSE
export const COURSE_COLLIDERS = renewalCourse?.colliders ?? legacy.COURSE_COLLIDERS
export const STAGES = renewalCourse?.stages.map(stage => ({
  ...stage, subtitle: stage.stage === 10 ? '오리를 따라 섬으로 내려와요' : stage.name + ' 구간',
})) ?? legacy.STAGES
export const STAGE_COUNT = STAGES.length
export const REWARDS = STAGES.map(stage => stage.reward)
export const LAP_REWARD = REWARDS.reduce((total, reward) => total + reward, 0)
export const BLOCK_BY_ID = new Map(COURSE.map(pad => [pad.id, pad]))
export const expectedCoins = (gate: number, today: number) => Math.min(REWARDS[gate - 1] ?? 0, Math.max(0, legacy.DAILY_CAP - today))

export function courseBlockIndex(value: unknown): number | null {
  if (!renewalCourse) return legacy.courseBlockIndex(value)
  if (typeof value === 'string') return BLOCK_BY_ID.get(value)?.block ?? null
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < COURSE.length ? value : null
}

export function blockAtFeet(p: { x: number; y: number; z: number }, tolerance = .11): CourseBlock | undefined {
  if (!renewalCourse) return legacy.blockAtFeet(p, tolerance)
  return COURSE.find(pad => Math.abs(p.y - pad.top) <= tolerance && containsPad(pad, p.x, p.z))
}
