import type { Group } from 'three'
import type { createCharacterRig } from '../../world/art/CharacterRig'
import { useWinter, winterFrozen, winterMotion } from './state'

const smooth = (v: number) => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v) }
export function winterPoseActive(id: string, now: number) {
  return !winterFrozen(id, now) && (!!winterMotion(id, now) || (useWinter.getState().players[id]?.snowballs ?? 0) > 0)
}

/** Uses the existing hand IK, after locomotion and before rig smoothing. L is +X on these supplied rigs. */
export function poseWinterAvatar(model: ReturnType<typeof createCharacterRig>, figure: Group,
  id: string, now: number, yaw: number, moving: boolean) {
  if (!winterPoseActive(id, now)) return
  const motion = winterMotion(id, now), age = motion ? now - motion.at : 0
  const hand = (side: 'L' | 'R', x: number, y: number, z: number, cup = true) => {
    model.reachFitnessHand(side, x, y, z, -.3, 0, 0)
    model.handPose(side, cup ? 'cup' : 'open')
  }
  if (motion?.kind === 'gather') {
    const scoop = smooth(age / 220), lift = smooth((age - 220) / 260), release = smooth((age - 620) / 180)
    const crouch = moving ? 0 : scoop * (1 - lift)
    model.set('spine', .75 * crouch)
    if (!moving) {
      model.set('upperLeg_L', -1.25 * crouch); model.set('upperLeg_R', -1.25 * crouch)
      model.set('lowerLeg_L', 2.4 * crouch); model.set('lowerLeg_R', 2.4 * crouch)
      model.set('foot_L', -1.15 * crouch); model.set('foot_R', -1.15 * crouch)
    }
    const squeeze = Math.sin(age / 38) * .025 * lift * (1 - release)
    for (const side of ['L', 'R'] as const) hand(side, (side === 'L' ? 1 : -1) * (.11 + squeeze),
      1.02 - .8 * scoop * (1 - lift), .48 + .06 * scoop * (1 - lift))
    return
  }
  if (motion?.kind === 'windup' || motion?.kind === 'throw') {
    const windup = motion.kind === 'windup', wind = windup ? smooth(age / 300) : 1
    const follow = windup ? 0 : smooth(age / 160), recover = windup ? smooth((age - 550) / 250) : smooth((age - 220) / 430)
    const weight = 1 - recover
    figure.rotation.y = Math.atan2(Math.sin(motion.yaw - yaw), Math.cos(motion.yaw - yaw)) * weight
    model.set('chest', 0, -.18 * wind * (1 - follow) * weight)
    model.set('spine', .18 * follow * weight)
    hand('R', -.11 - .2 * wind * (1 - follow) * weight,
      1.02 + (.5 * wind * (1 - follow) + .14 * follow) * weight,
      .48 + (-.63 * wind * (1 - follow) + .2 * follow) * weight, windup)
    hand('L', .11, 1.02 + .07 * weight, .48 - .12 * follow * weight)
    return
  }
  hand('L', .11, 1.02, .48); hand('R', -.11, 1.02, .48)
}
