import { CLAP_EMOTE, NETWORK, SOCIAL_GESTURES } from '../../config'
import type { createCharacterRig } from './CharacterRig'
import { sampleSocialGesture } from './socialGestureMotion'

type Rig = Pick<
  ReturnType<typeof createCharacterRig>,
  'set' | 'clap' | 'handPose' | 'reachHand' | 'socialArmScale'
>
const smooth = (v: number) => {
  const t = Math.max(0, Math.min(1, v))
  return t * t * (3 - 2 * t)
}

/** Server-time poses, shared by live avatars and deterministic asset inspection. */
export function sampleCharacterEmote(kind: string, age: number, rig: Rig) {
  const duration =
    kind === 'EMOTE_CLAP'
      ? CLAP_EMOTE.durationMs
      : kind === 'EMOTE_WAVE' || kind === 'EMOTE_TABLE_FLIP'
        ? SOCIAL_GESTURES[kind].durationMs
        : NETWORK.emoteDurationMs
  if (!Number.isFinite(age) || age < 0 || age >= duration) return false
  const blend = smooth(age / 280) * smooth((duration - age) / 320)
  const signWave = Math.sin((age / 1000) * Math.PI * 2 * 2)
  if (kind === 'EMOTE_CLAP') {
    rig.clap(age)
  } else if (kind === 'EMOTE_TSK') {
    // Index extends from a closed hand, pointing forwards with a small wag.
    rig.reachHand(
      'R',
      -0.24 + signWave * 0.018,
      0.84,
      0.27,
      -Math.PI / 2,
      0,
      signWave * 0.1,
      blend,
    )
    rig.handPose('R', 'point', blend)
    rig.set('neck', 0, signWave * 0.035 * blend)
    rig.set('head', 0, signWave * 0.075 * blend)
  } else if (kind === 'EMOTE_APPLAUSE_REQUEST') {
    // Two inviting scoops, palms up and elbows hanging below the wrists.
    // A small lead on the right hand avoids a mechanical mirrored flap.
    for (const side of ['L', 'R'] as const) {
      const sign = side === 'L' ? 1 : -1
      const phase = Math.max(0, age - 200 - (side === 'L' ? 45 : 0)) / 680
      const lift = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2)
      rig.reachHand(
        side,
        sign * (0.32 + lift * 0.025),
        0.73 + lift * 0.115,
        0.23 - lift * 0.025,
        -Math.PI / 2 - lift * 0.2,
        (sign * Math.PI) / 2,
        0,
        blend,
      )
      rig.handPose(side, 'cup', blend)
    }
    rig.set('head', -0.025 * blend)
  } else if (kind === 'EMOTE_WAVE') {
    const waveBlend = smooth(age / 420) * smooth((duration - age) / 500)
    rig.reachHand(
      'R',
      -0.42 + signWave * 0.035,
      1.01,
      0.12,
      Math.PI,
      -Math.PI / 2,
      signWave * 0.22,
      waveBlend,
    )
    rig.handPose('R', 'open', waveBlend)
    rig.set('head', 0, -0.06 * waveBlend, -0.025 * waveBlend)
  } else if (kind === 'EMOTE_TABLE_FLIP') {
    sampleSocialGesture(kind, age, (joint, x = 0, y = 0, z = 0) =>
      rig.set(
        joint,
        joint.startsWith('upperArm') ? x * rig.socialArmScale : x,
        y,
        z,
      ),
    )
    rig.handPose('L', 'open', blend)
    rig.handPose('R', 'open', blend)
  } else if (kind === 'EMOTE_FART') {
    rig.set('neck', 0, 0.045 * blend)
    rig.set('head', 0, 0.14 * blend)
  } else return false
  return true
}
