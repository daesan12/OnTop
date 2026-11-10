import type { PassJudgement } from './jumpRopeJudgement'

const durations = { good: 550, perfect: 680, combo5: 960, combo10: 1180 } as const
export type PigeonSuccessKind = keyof typeof durations
export type PigeonSuccessCue = { kind: PigeonSuccessKind; startedAt: number; variant: number }

export function successKind(kind: PassJudgement['kind'], combo: number): PigeonSuccessKind | null {
  if (kind === 'miss') return null
  if (kind === 'good') return 'good'
  if (combo >= 10) return 'combo10'
  if (combo >= 5) return 'combo5'
  return 'perfect'
}

export const neutralSuccessPose = { pitch: 0, yaw: 0, roll: 0, leftWing: 0, rightWing: 0, lidLift: 0, bodyRoll: 0 }
export type SuccessPose = typeof neutralSuccessPose

const murmurDelays = [55, 175, 115, 245]
const panicDelays = [35, 135, 80, 200]
const wingStrengths = [0.74, 0.52, 0.9, 0.62]

export function isSuccessActive(cue: PigeonSuccessCue, now: number) {
  return now - cue.startedAt < durations[cue.kind]
}

function smoothStep(t: number) {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

export function samplePigeonSuccess(cue: PigeonSuccessCue, role: 'holder' | 'audience', index: number, now: number): SuccessPose {
  const { kind, startedAt, variant } = cue
  const first = variant % 4
  const neighborSide = index % 2 === 0 ? 1 : -1
  const holding = role === 'holder'
  if (holding && kind === 'good') return neutralSuccessPose
  if (!holding && kind === 'good' && index !== first && (variant % 2 === 0 || index !== (first + 1) % 4)) return neutralSuccessPose
  if (!holding && kind === 'perfect' && index !== first && index !== (first + 2) % 4) return neutralSuccessPose

  const delay = holding ? index * 55 : kind === 'combo5' ? (murmurDelays[index] ?? 0)
    : kind === 'combo10' ? (panicDelays[index] ?? 0) : index === first ? 25 : 130
  const age = now - startedAt - delay
  const duration = durations[kind] - delay
  if (age <= 0 || age >= duration) return neutralSuccessPose
  const weight = smoothStep(age / 95) * smoothStep((duration - age) / 175)

  if (holding) {
    const intensity = kind === 'combo10' ? 1.32 : kind === 'combo5' ? 1.15 : 1
    const twitch = kind === 'perfect' ? 1 : 0.72 + 0.28 * Math.cos(age / 47 + index)
    return {
      ...neutralSuccessPose,
      pitch: -0.15 * weight * intensity * twitch,
      roll: neighborSide * 0.15 * weight * twitch,
      lidLift: 0.04 * weight * intensity,
    }
  }

  switch (kind) {
    case 'good':
      return { ...neutralSuccessPose, pitch: 0.11 * weight, yaw: neighborSide * 0.19 * weight, lidLift: -0.009 * weight }
    case 'perfect':
      return { ...neutralSuccessPose, pitch: -0.37 * weight, roll: neighborSide * 0.09 * weight,
        leftWing: 0.21 * weight, rightWing: 0.17 * weight, lidLift: 0.042 * weight }
    case 'combo5': {
      const glance = 1 - smoothStep((age - 300) / 175)
      return { ...neutralSuccessPose, yaw: neighborSide * (0.59 * glance - 0.16 * (1 - glance)) * weight,
        pitch: (0.15 - 0.31 * glance) * weight, roll: neighborSide * 0.14 * weight, lidLift: 0.029 * weight }
    }
    case 'combo10': {
      const shake = Math.sin(age / (48 + index * 9) + index)
      const flap = (0.45 + 0.55 * Math.abs(shake)) * weight * (wingStrengths[index] ?? 0.65)
      return { pitch: (-0.37 + shake * 0.19) * weight, yaw: neighborSide * (0.16 + shake * 0.24) * weight,
        roll: -neighborSide * shake * 0.18 * weight, lidLift: 0.045 * weight,
        leftWing: flap * (neighborSide === 1 ? 1 : 0.55), rightWing: flap * (neighborSide === 1 ? 0.55 : 1),
        bodyRoll: neighborSide * shake * (0.075 + index * 0.018) * weight }
    }
  }
}

export function blendSuccessPose(from: SuccessPose, to: SuccessPose, progress: number): SuccessPose {
  const t = smoothStep(progress)
  const mix = (start: number, end: number) => start + (end - start) * t
  return {
    pitch: mix(from.pitch, to.pitch), yaw: mix(from.yaw, to.yaw), roll: mix(from.roll, to.roll),
    leftWing: mix(from.leftWing, to.leftWing), rightWing: mix(from.rightWing, to.rightWing),
    lidLift: mix(from.lidLift, to.lidLift), bodyRoll: mix(from.bodyRoll, to.bodyRoll),
  }
}
