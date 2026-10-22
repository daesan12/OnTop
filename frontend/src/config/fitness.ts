import type { BoxCollider, Vec3 } from './world'
import { AVATAR } from './avatar'

export const FITNESS = {
  interactionRadius: 3,
  pedalHeight: 0.24,
  hipHeight: AVATAR.hipHeight * AVATAR.scale,
  handleHeight: 0.24 + (1.25 - 0.24) * AVATAR.scale,
  handleReach: 0.6 * AVATAR.scale,
  swingRadians: 0.43,
  cycleSeconds: 2.4,
  exitOffset: 2.2,
  padSurfaceHeight: 0.055,
} as const
import { FITNESS_AREA } from './parkPlan'
export { FITNESS_AREA } from './parkPlan'
export const PULLDOWN_LIFT = 0.38
export type FitnessKind =
  | 'walker'
  | 'twister'
  | 'shoulder'
  | 'surfer'
  | 'rower'
  | 'elliptical'
  | 'situp'
  | 'inversion'
  | 'backmassage'
  | 'legpress'
  | 'pulldown'
export interface FitnessStation {
  id: string
  kind: FitnessKind
  name: string
  position: Vec3
  yaw: number
  baseHeight: number
  instruction: string
}
const station = (
  id: string,
  kind: FitnessKind,
  name: string,
  x: number,
  z: number,
  baseHeight: number,
  instruction: string,
): FitnessStation => ({
  id,
  kind,
  name,
  position: [FITNESS_AREA.x + x, 0, FITNESS_AREA.z + z],
  yaw: Math.PI,
  baseHeight,
  instruction,
})
// Adjustable perimeter layout leaves an open central exercise court, all north
// of the arrival path. Keep 5–6m between neighbours and clear 2.2m dismounts.
export const FITNESS_STATIONS: readonly FitnessStation[] = [
  station(
    'walker-1',
    'walker',
    '공중걷기 1',
    -9,
    2,
    0.24,
    '손잡이를 잡고 양발을 번갈아 앞뒤로 움직여요.',
  ),
  station(
    'walker-2',
    'walker',
    '공중걷기 2',
    -9,
    -4,
    0.24,
    '손잡이를 잡고 양발을 번갈아 앞뒤로 움직여요.',
  ),
  station(
    'twister',
    'twister',
    '허리돌리기',
    -9,
    -10,
    0.16,
    '손잡이를 잡고 원판 위에서 하체를 좌우로 돌려요.',
  ),
  station(
    'shoulder',
    'shoulder',
    '팔돌리기',
    -3,
    -10,
    0.06,
    '손잡이를 잡고 큰 바퀴를 둥글게 돌려요.',
  ),
  station(
    'surfer',
    'surfer',
    '파도타기',
    3,
    -10,
    0.24,
    '손잡이를 잡고 두 발을 모아 좌우로 흔들어요.',
  ),
  station(
    'elliptical',
    'elliptical',
    '달리기',
    9,
    -10,
    0.24,
    '손과 발을 번갈아 움직이며 타원 궤도로 걸어요.',
  ),
  station(
    'rower',
    'rower',
    '노젓기',
    9,
    -4,
    0.08,
    '앉아서 발을 받치고 손잡이를 몸 쪽으로 당겨요.',
  ),
  station(
    'situp',
    'situp',
    '윗몸일으키기',
    9,
    2,
    0.08,
    '발을 고정하고 상체를 눕혔다 천천히 일으켜요.',
  ),
  station(
    'inversion',
    'inversion',
    '거꾸로 매달리기',
    -9,
    7,
    0.68,
    '등받이에 기대면 발 고정대와 함께 천천히 기울어져요.',
  ),
  station(
    'backmassage',
    'backmassage',
    '등허리지압',
    -3,
    7,
    0.06,
    '롤러에 등을 대고 몸을 위아래로 움직여요.',
  ),
  station(
    'legpress',
    'legpress',
    '오금펴기',
    3,
    7,
    0.08,
    '등받이에 앉아 두 발로 발판을 밀었다 돌아와요.',
  ),
  station(
    'pulldown',
    'pulldown',
    '역기내리기',
    9,
    7,
    0.08,
    '손잡이를 아래로 당기면 의자와 몸이 함께 올라가요. 천천히 놓으면 내려와요.',
  ),
]
export const FITNESS_COLLIDERS: readonly BoxCollider[] = [
  {
    id: 'fitness-pad',
    center: [FITNESS_AREA.x, FITNESS.padSurfaceHeight - 0.025, FITNESS_AREA.z],
    half: [FITNESS_AREA.width / 2, 0.025, FITNESS_AREA.depth / 2],
    camera: false,
  },
  ...FITNESS_STATIONS.map((s) => ({
    id: s.id,
    center: [s.position[0], 1.1, s.position[2]] as Vec3,
    half: [1.15, 1.1, 1.1] as Vec3,
    camera: true,
  })),
]
export function fitnessSwing(startedAt: number, now: number) {
  const age = Math.max(0, (now - startedAt) / 1000)
  return (
    Math.sin((age * Math.PI * 2) / FITNESS.cycleSeconds) *
    FITNESS.swingRadians *
    Math.min(1, age / 0.4)
  )
}
export interface FitnessMotion {
  cycle: number
  bodyX: number
  bodyY: number
  bodyZ: number
  offsetY: number
  offsetZ: number
  leftLeg: number
  rightLeg: number
  legZ: number
  leftArm: number
  rightArm: number
  armZ: number
  wheel: number
  mechanism: number
  lowerYaw: number
  leftLegScale: number
  rightLegScale: number
  leftPedalY: number
  rightPedalY: number
  leftPedalZ: number
  rightPedalZ: number
}
export function createFitnessMotion(): FitnessMotion {
  return {
    cycle: 0,
    bodyX: 0,
    bodyY: 0,
    bodyZ: 0,
    offsetY: 0,
    offsetZ: 0,
    leftLeg: 0,
    rightLeg: 0,
    legZ: 0,
    leftArm: -1.35,
    rightArm: -1.35,
    armZ: 0.06,
    wheel: 0,
    mechanism: 0,
    lowerYaw: 0,
    leftLegScale: 1,
    rightLegScale: 1,
    leftPedalY: -0.6,
    rightPedalY: -0.6,
    leftPedalZ: 0.08,
    rightPedalZ: 0.08,
  }
}
/** Deterministic poses in avatar model space; machines and avatars share this clock. */
export function sampleFitnessMotion(
  kind: FitnessKind,
  startedAt: number,
  now: number,
  out: FitnessMotion,
) {
  const age = Math.max(0, (now - startedAt) / 1000),
    ease = Math.min(1, age / 0.5),
    phase = (age * Math.PI * 2) / FITNESS.cycleSeconds
  const a = fitnessSwing(startedAt, now),
    s = Math.sin(phase) * ease,
    c = (1 - Math.cos(phase)) * 0.5 * ease
  out.cycle = a
  out.bodyX =
    out.bodyY =
    out.bodyZ =
    out.offsetY =
    out.offsetZ =
    out.leftLeg =
    out.rightLeg =
    out.legZ =
    out.wheel =
    out.mechanism =
      0
  out.leftArm = out.rightArm = -1.35
  out.armZ = 0.06
  out.lowerYaw = 0
  out.leftLegScale = out.rightLegScale = 1
  out.leftPedalY = out.rightPedalY = -0.6
  out.leftPedalZ = out.rightPedalZ = 0.08
  switch (kind) {
    case 'walker':
      out.leftLeg = a
      out.rightLeg = -a
      out.mechanism = a
      break
    case 'elliptical': {
      out.leftPedalZ = 0.08 + 0.24 * s
      out.rightPedalZ = 0.08 - 0.24 * s
      out.leftPedalY = -0.6 + 0.035 * (1 - Math.cos(phase)) * ease
      out.rightPedalY = -0.6 + 0.035 * (1 + Math.cos(phase)) * ease
      out.leftLegScale = Math.sqrt(
        (out.leftPedalY ** 2 + out.leftPedalZ ** 2 - 0.08 ** 2) / 0.36,
      )
      out.rightLegScale = Math.sqrt(
        (out.rightPedalY ** 2 + out.rightPedalZ ** 2 - 0.08 ** 2) / 0.36,
      )
      const left =
        Math.atan2(out.leftPedalZ, out.leftPedalY) -
        Math.atan2(0.08, -0.6 * out.leftLegScale)
      const right =
        Math.atan2(out.rightPedalZ, out.rightPedalY) -
        Math.atan2(0.08, -0.6 * out.rightLegScale)
      out.leftLeg = Math.atan2(Math.sin(left), Math.cos(left))
      out.rightLeg = Math.atan2(Math.sin(right), Math.cos(right))
      out.leftArm = -1.1 - a * 0.7
      out.rightArm = -1.1 + a * 0.7
      out.mechanism = a
      break
    }
    case 'twister':
      out.lowerYaw = a
      out.mechanism = a
      break
    case 'shoulder':
      out.leftArm = -1.6 + Math.sin(phase) * 0.65 * ease
      out.rightArm = -1.6 + Math.sin(phase + Math.PI) * 0.65 * ease
      out.armZ = 0.25 + Math.cos(phase) * 0.5 * ease
      out.wheel = phase
      break
    case 'surfer':
      out.bodyZ = a * 0.65
      out.mechanism = a * 0.65
      break
    case 'rower':
      out.leftLeg = out.rightLeg = -1.15 + 0.25 * c
      out.bodyX = 0.15 - 0.3 * c
      out.leftArm = out.rightArm = -1.3 + 0.65 * c
      out.offsetZ = -0.18 * c
      out.mechanism = c
      break
    case 'situp':
      out.bodyX = -1.05 + 0.7 * c
      out.leftLeg = out.rightLeg = -1.25 - out.bodyX
      out.leftArm = out.rightArm = -0.4
      out.mechanism = out.bodyX
      break
    case 'inversion':
      out.bodyX = -2.65 * c
      out.leftArm = out.rightArm = -0.15
      out.mechanism = out.bodyX
      break
    case 'backmassage':
      out.offsetY = -0.1 * c
      out.leftArm = out.rightArm = -0.4
      out.leftLeg = out.rightLeg = 0.08 * c
      out.wheel = s
      break
    case 'legpress':
      out.leftLeg = out.rightLeg = -0.8 - 0.65 * c
      out.offsetZ = -0.25 * c
      out.leftArm = out.rightArm = -0.25
      out.mechanism = c
      break
    case 'pulldown':
      out.offsetY = (PULLDOWN_LIFT / AVATAR.scale) * c
      out.leftLeg = out.rightLeg = -1.2
      out.leftArm = out.rightArm = -2.7 + 1.1 * c
      out.armZ = 0.25
      out.mechanism = c
      break
  }
  out.offsetY +=
    AVATAR.hipHeight * (1 - Math.cos(out.bodyX) * Math.cos(out.bodyZ))
  out.offsetZ -= AVATAR.hipHeight * Math.sin(out.bodyX)
  return out
}
