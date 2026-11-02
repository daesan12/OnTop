import { JUMP_SEQUENCE, JUMP_START, JUMP_FINISH, JUMP_STAGES, containsJumpPad, type JumpPad } from '../../layout-preview/jumpCourse'
import { PARK_MAP_VERSION } from '../../map/park/generated/mapVersion'

/** Service data wraps the accepted new-map course. Never reconstructs/scales the art. */
export const COURSE_VERSION = 'park180-jump-v1'
export const RULES_VERSION = 'v3'
export const MAP_VERSION = PARK_MAP_VERSION
export const DAILY_CAP = 500
export const STATUS_PATH = '/api/v1/minigames/jumpmap/status'
export const TIPS_PATH = '/api/v1/minigames/jumpmap/tips'
export const STAGES = JUMP_STAGES.map((s, i) => ({ ...s, stage: i + 1, subtitle: ['돌탑을 따라 한 걸음', '또각또각, 하늘로', '노릇한 구름길', '폭신한 하늘 계단', '공원 위 반짝이는 길', '바람을 타고', '호수로 뛰어들어요'][i]! }))
export const REWARDS = JUMP_STAGES.map(s => s.reward)
export const COURSE = JUMP_SEQUENCE.map((pad, block) => Object.freeze({ ...pad, block, top: pad.height, stage: pad.stage + 1 }))
export type CourseBlock = typeof COURSE[number]
export const BLOCK_BY_ID = new Map(COURSE.map(p => [p.id, p]))
export const START = JUMP_START
export const FINISH = JUMP_FINISH
export const RETURN_TO = { x: START.x, z: START.z + 1.6, name: '돌탑 점프맵 · 출발 자리' }
export const COURSE_COLLIDERS = COURSE.map(b => ({ id: b.id, block: b.block, stage: b.stage, gate: b.gate ?? null,
  shape: b.radius === undefined ? 'box' as const : 'cylinder' as const, camera: false,
  center: [b.x, b.top - b.thickness / 2, b.z], half: [b.halfX, b.thickness / 2, b.halfZ], radius: b.radius ?? null,
  // Existing rectangular kites are axis-aligned; other yaw values affect art only.
  yaw: 0, top: b.top, thickness: b.thickness }))
export const courseBlockIndex = (value: unknown): number | null => typeof value === 'string'
  ? BLOCK_BY_ID.get(value)?.block ?? null : Number.isInteger(value) && Number(value) >= 0 && Number(value) < COURSE.length ? Number(value) : null
export function blockAtFeet(p: { x: number; y: number; z: number }, tolerance = .11): CourseBlock | undefined {
  return COURSE.find(b => Math.abs(p.y - b.top) <= tolerance && containsJumpPad(b as JumpPad, p.x, p.z))
}
export const expectedCoins = (gate: number, today: number) => Math.min(REWARDS[gate - 1] ?? 0, Math.max(0, DAILY_CAP - today))
export const kstDate = (now = Date.now()) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10)
export function targetFade(top: number, feet: number, running: boolean, occupied: boolean, occluded: boolean) {
  let fade = 1
  if (top >= 15) {
    const dy = top - feet, outside = dy > 12 ? dy - 12 : dy < -8 ? -8 - dy : 0
    fade = running ? Math.max(.15, 1 - outside / 4) : .15
    if (occupied) fade = Math.max(fade, .6)
  }
  return occluded ? Math.min(fade, .25) : fade
}
