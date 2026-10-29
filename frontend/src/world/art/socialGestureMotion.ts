import { SOCIAL_GESTURES, type SocialGesture } from '../../config'

type Joint =
  | 'chest'
  | 'head'
  | 'upperArm_L'
  | 'upperArm_R'
  | 'lowerArm_L'
  | 'lowerArm_R'
  | 'hand_L'
  | 'hand_R'
type SetJoint = (joint: Joint, x?: number, y?: number, z?: number) => void
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}
// Time, chest, shoulder, elbow, wrist. A brief anticipation pause after confirmation,
// followed by reach, dip, upward scoop, follow-through and relaxed recovery.
const flipKeys = [
  [0, 0, 0, 0, 0],
  [240, 0, 0, 0, 0],
  [750, 0.28, -0.8, -0.55, -0.25],
  [1050, 0.38, -0.95, -0.45, -0.3],
  [1450, -0.12, -2.15, -0.35, 0.2],
  [1750, -0.08, -1.95, -0.55, 0.1],
  [2400, 0, -0.25, -0.25, 0],
  [2800, 0, 0, 0, 0],
] as const

/** Writes only upper-body joints; no table transforms, physics or game state. */
export function sampleSocialGesture(
  kind: SocialGesture,
  age: number,
  set: SetJoint,
): boolean {
  if (
    !Number.isFinite(age) ||
    age < 0 ||
    age >= SOCIAL_GESTURES[kind].durationMs
  )
    return false
  if (kind === 'EMOTE_WAVE') {
    const envelope = smooth(age / 420) * smooth((2600 - age) / 500)
    const swing = Math.sin((Math.max(0, age - 420) / 1000) * Math.PI * 2 * 2.2)
    set('upperArm_R', -0.35 * envelope, 0, -1.9 * envelope)
    set('lowerArm_R', -0.9 * envelope, 0, swing * 0.28 * envelope)
    set('hand_R', 0, swing * 0.25 * envelope, swing * 0.18 * envelope)
    set('head', 0, -0.08 * envelope, -0.06 * envelope)
    return true
  }
  let i = 1
  while (i < flipKeys.length - 1 && age > flipKeys[i]![0]) i++
  const a = flipKeys[i - 1]!,
    b = flipKeys[i]!
  const t = smooth((age - a[0]) / (b[0] - a[0]))
  const mix = (index: 1 | 2 | 3 | 4) => a[index] + (b[index] - a[index]) * t
  const chest = mix(1),
    shoulder = mix(2),
    elbow = mix(3),
    wrist = mix(4)
  set('chest', chest)
  set('head', -chest * 0.5)
  set('upperArm_L', shoulder, 0, 0.08 * Math.sin((Math.PI * age) / 2800))
  set('upperArm_R', shoulder, 0, -0.08 * Math.sin((Math.PI * age) / 2800))
  set('lowerArm_L', elbow)
  set('lowerArm_R', elbow)
  set('hand_L', wrist)
  set('hand_R', wrist)
  return true
}
