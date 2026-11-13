import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Euler, Matrix4, Quaternion, Vector3, type Group } from 'three'
import { ParkAssetLoader } from '../world/art/assetLoader'
import { characterUrls } from '../world/art/characterAssets'
import { createClipPose } from '../world/art/characterClips'
import { defaultLook, type CharacterVariant } from '../world/art/characterLook'
import { createSafeCharacterRig } from '../world/art/safeCharacterRig'
import { blendPose, sampleJumpPose, type Pose, type PreviewMotion } from './previewMotion'
import { AvatarShockXray } from './AvatarShockXray'
import type { MissShockPose } from './missShock'
import type { AvatarExtras } from './grandpaPose'

type Rig = ReturnType<typeof createSafeCharacterRig>
const sides = ['L', 'R'] as const
const joints = [
  'spine', 'chest', 'head', 'clavicle_L', 'clavicle_R',
  'upperLeg_L', 'lowerLeg_L', 'foot_L', 'upperArm_L', 'lowerArm_L',
  'upperLeg_R', 'lowerLeg_R', 'foot_R', 'upperArm_R', 'lowerArm_R',
] as const
type JumpJoint = typeof joints[number]
// Story 420 preview poses: a deep duck under the broom, and the stagger after a hit.
const ducked: Pose = { thigh: -1.02, knee: 1.72, toe: 0, shoulder: 0.62, elbow: -1.15, spread: 0.1, lean: 0.66 }
const staggered: Pose = { thigh: -0.12, knee: 0.3, toe: 0, shoulder: -1.1, elbow: -0.3, spread: 0.62, lean: -0.34 }
const noExtras: AvatarExtras = { duck: 0, stun: 0, stunAgeMs: 0 }
const releaseMs = 90

function feetInRig(rig: Rig, inverse: Matrix4, left: Vector3, right: Vector3) {
  rig.root.updateWorldMatrix(true, false)
  inverse.copy(rig.root.matrixWorld).invert()
  rig.bones.foot_L.getWorldPosition(left).applyMatrix4(inverse)
  rig.bones.foot_R.getWorldPosition(right).applyMatrix4(inverse)
}

export function PreviewAvatar({ motion, scale, shock, variant = 'man', extras }: {
  motion: PreviewMotion
  scale: number
  shock: RefObject<MissShockPose>
  variant?: CharacterVariant
  /** Unranked preview only. Without it, the avatar keeps the original jump and shock poses. */
  extras?: RefObject<AvatarExtras>
}) {
  const source = useLoader(ParkAssetLoader, characterUrls[variant === 'girl' ? 1 : 0]!)
  const figure = useRef<Group>(null)
  const wasPosing = useRef(false)
  // A released duck or a cleared stun eases out instead of snapping back to the standing pose.
  const shownRef = useRef({ duck: 0, stun: 0 })
  const { rig, floorOffset, rest, feetZ, inverse, left, right, euler, delta } = useMemo(() => {
    const rig = createSafeCharacterRig(source, defaultLook(variant), new Map([[variant, source]]))
    rig.reset()
    createClipPose().ground(0, 0, 0, rig.set)
    for (let frame = 0; frame < 5; frame++) rig.apply(0.1)
    const inverse = new Matrix4(), left = new Vector3(), right = new Vector3()
    feetInRig(rig, inverse, left, right)
    return {
      rig, floorOffset: rig.groundShift(),
      rest: Object.fromEntries(joints.map(name => [name, rig.bones[name].quaternion.clone()])) as Record<JumpJoint, Quaternion>,
      feetZ: (left.z + right.z) / 2,
      inverse, left, right, euler: new Euler(), delta: new Quaternion(),
    }
  }, [source, variant])

  useEffect(() => () => rig.dispose(), [rig])

  useFrame((_, frameSeconds) => {
    const root = figure.current
    if (!root) return
    const stiffness = shock.current.stiffness
    const extra = extras?.current ?? noExtras
    const fall = Math.min(1, frameSeconds * 1000 / releaseMs)
    const shown = shownRef.current
    shown.duck = Math.max(extra.duck, shown.duck - fall)
    shown.stun = Math.max(extra.stun, shown.stun - fall)
    const { duck, stun } = shown
    const posing = motion.frame.phase !== 'ready' || stiffness > 0 || duck > 0 || stun > 0
    if (!posing && !wasPosing.current) return
    wasPosing.current = posing
    let pose = sampleJumpPose(motion.frame)
    if (duck > 0) pose = blendPose(pose, ducked, duck)
    if (stun > 0) pose = blendPose(pose, staggered, stun)
    const wobble = stun * Math.sin(extra.stunAgeMs * 0.045) * 0.16

    function turn(name: JumpJoint, pitch: number, roll = 0) {
      delta.setFromEuler(euler.set(pitch, 0, roll))
      rig.bones[name].quaternion.copy(rest[name]).multiply(delta)
    }

    turn('spine', pose.lean * 0.65, wobble)
    turn('chest', pose.lean * 0.55, wobble * 0.8)
    turn('head', -pose.lean * 0.48 - duck * 0.18, -wobble * 1.4)
    const legExtension = 1 - stiffness * 0.72
    for (const side of sides) {
      const sign = side === 'L' ? 1 : -1
      turn(`upperLeg_${side}`, pose.thigh * legExtension)
      turn(`lowerLeg_${side}`, pose.knee * legExtension)
      turn(`foot_${side}`, (pose.toe - pose.thigh - pose.knee) * legExtension)
      turn(`clavicle_${side}`, pose.shoulder * 0.2, sign * pose.spread * 0.28)
      turn(`upperArm_${side}`, pose.shoulder * (1 - stiffness) - 0.1 * stiffness, sign * (pose.spread + 0.24 * stiffness))
      turn(`lowerArm_${side}`, pose.elbow * (1 - stiffness * 0.88))
    }

    feetInRig(rig, inverse, left, right)
    // Keep the lowest point of the shoes at the requested height as the ankles turn.
    root.position.y = rig.groundShift() + motion.frame.height / scale
    root.position.z = feetZ - (left.z + right.z) / 2
  }, -0.25)

  return (
    <group ref={figure} position-y={floorOffset}>
      <primitive object={rig.root} dispose={null} />
      <AvatarShockXray model={rig.root} bones={rig.bones} shock={shock} />
    </group>
  )
}
