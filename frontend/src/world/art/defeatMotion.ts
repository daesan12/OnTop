import { DEFEAT_DURATION, type DefeatKind } from '../../game/presentation/defeat'
import type { createCharacterRig } from './CharacterRig'
import { sampleCharacterEmote } from './characterEmotes'

type Rig = Pick<ReturnType<typeof createCharacterRig>, 'set' | 'bones' | 'reachFitnessHand' | 'handPose'
  | 'clap' | 'reachHand' | 'socialArmScale'>
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }

/** Bounded upper-body overlay. Reuses the shipped rig and IK; never moves the game board. */
export function sampleDefeatMotion(kind: DefeatKind, age: number, rig: Rig) {
  if (!Number.isFinite(age) || age < 0 || age >= DEFEAT_DURATION[kind]) return false
  if (kind === 'table-flip') return sampleCharacterEmote('EMOTE_TABLE_FLIP', age, rig)
  const blend = smooth(age / 650) * smooth((DEFEAT_DURATION[kind] - age) / 800)
  const hold = smooth((age - 650) / 350) * smooth((2900 - age) / 400)
  rig.set('chest', .16 * blend)
  rig.set('neck', .08 * blend)
  rig.set('head', .20 * blend, Math.sin(age / 360) * .025 * hold)
  // Model-local targets use the actual head's bind height for both character variants.
  let headY = 0
  let bone = rig.bones.head as import('three').Object3D | null
  while (bone && 'isBone' in bone) { headY += bone.position.y; bone = bone.parent }
  const y = headY + .045
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1
    // Approach the temples from outside, fingers resting toward the crown.
    // Chest/head lean is modest so hands remain beside the oversized stylized head.
    rig.reachHand(side, sign * .22, y, .015, 0, sign * Math.PI / 2, sign * .25, blend, false)
    rig.handPose(side, 'cup', blend)
  }
  return true
}
