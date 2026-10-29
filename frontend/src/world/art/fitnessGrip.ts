import { Quaternion, Vector3, type Group } from 'three'
import { AVATAR, FITNESS, type FitnessMotion, type FitnessStation } from '../../config'
import type { createCharacterRig } from './CharacterRig'
const sides = ['L', 'R'] as const

/** Targets on the existing machine's actual bars, in station coordinates. */
export function sampleFitnessGrip(station: FitnessStation, motion: FitnessMotion, side: 'L' | 'R', out: Vector3) {
  const sign = side === 'L' ? 1 : -1
  switch (station.kind) {
    case 'walker': return out.set(sign * 0.24, FITNESS.handleHeight, FITNESS.handleReach)
    case 'twister': return out.set(sign * 0.24, 1.1, 0.6 - Math.sqrt(0.55 ** 2 - 0.24 ** 2))
    case 'surfer': return out.set(sign * 0.12, 1.1, 0.18)
    case 'shoulder': return out.set(sign * 0.23 * Math.cos(motion.wheel), 1.02 + sign * 0.23 * Math.sin(motion.wheel), 0.18)
    case 'elliptical': {
      const angle = side === 'L' ? motion.rightArm : motion.leftArm
      return out.set(sign * 0.32 * AVATAR.scale,
        station.baseHeight + (1.08 - 0.28 * Math.cos(angle) - 0.05 * Math.sin(angle)) * AVATAR.scale,
        (-0.28 * Math.sin(angle) + 0.05 * Math.cos(angle)) * AVATAR.scale)
    }
    case 'rower': {
      const angle = -motion.mechanism * 0.5
      return out.set(sign * 0.24, 0.65 + 0.35 * Math.cos(angle), 0.05 + 0.35 * Math.sin(angle))
    }
    case 'pulldown': {
      const angle = motion.mechanism * 0.12
      return out.set(sign * 0.22, 1.36 - 0.3 * Math.cos(angle) - 0.55 * Math.sin(angle),
        -0.4 - 0.3 * Math.sin(angle) + 0.55 * Math.cos(angle))
    }
    default: return null
  }
}

export function createFitnessGrip() {
  const target = new Vector3(), inverse = new Quaternion()
  return (station: FitnessStation, motion: FitnessMotion, figure: Group, model: ReturnType<typeof createCharacterRig>) => {
    inverse.setFromEuler(figure.rotation).invert()
    for (const side of sides) {
      if (!sampleFitnessGrip(station, motion, side, target)) continue
      target.y -= station.baseHeight
      target.sub(figure.position).applyQuaternion(inverse)
      model.reachFitnessHand(side, target.x, target.y, target.z, -Math.PI / 2, 0, 0)
      model.handPose(side, 'fist')
    }
  }
}
