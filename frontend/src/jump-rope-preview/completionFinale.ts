export const completionResultMs = 2700
export const completionPreviewEndMs = completionResultMs + 2200

export function completionEase(age: number, from: number, to: number) {
  const t = Math.min(1, Math.max(0, (age - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

export function sampleExhaustedHolder(age: number, index: number) {
  const delay = index === 0 ? 40 : 145
  const droop = completionEase(age, delay, delay + 650)
  const sigh = completionEase(age, delay + 210, delay + 420) * (1 - completionEase(age, delay + 420, delay + 720))
  return {
    pitch: (index === 0 ? 0.69 : 0.58) * droop + 0.09 * sigh,
    roll: (index === 0 ? -0.1 : 0.13) * droop,
    sink: -0.104 * droop - 0.024 * sigh,
    wingDrop: -0.26 * droop,
    lidLift: -0.029 * droop,
  }
}

const audienceTiming = [
  { lookAt: 140, neighbour: 1, dropAt: 1290, dropMs: 480, depth: 0.92 },
  { lookAt: 205, neighbour: -1, dropAt: 930, dropMs: 510, depth: 1.12 },
  { lookAt: 295, neighbour: 1, dropAt: 1510, dropMs: 450, depth: 0.9 },
  { lookAt: 350, neighbour: -1, dropAt: 1840, dropMs: 540, depth: 1.08 },
] as const

export function sampleResignedAudience(age: number, index: number) {
  const { lookAt, neighbour, dropAt, dropMs, depth } = audienceTiming[index]!
  const glance = completionEase(age, lookAt, lookAt + 245) * (1 - completionEase(age, dropAt - 260, dropAt - 20))
  const slump = completionEase(age, dropAt, dropAt + dropMs)
  const hesitate = index === 3
    ? completionEase(age, 1170, 1310) * (1 - completionEase(age, 1380, 1570)) : 0
  return {
    slump,
    yaw: neighbour * (0.73 * glance - 0.15 * hesitate),
    pitch: depth * slump - 0.13 * glance,
    roll: neighbour * (0.1 * glance + 0.12 * hesitate + 0.09 * slump),
    headDrop: 0.032 * slump,
    headForward: 0.102 * slump,
    sink: -0.052 * slump,
    wingDrop: -0.09 * slump,
    lidLift: 0.034 * glance - 0.041 * slump,
    gazeX: neighbour * 0.8 * glance,
    gazeY: 0.14 * glance - 0.72 * slump,
  }
}
