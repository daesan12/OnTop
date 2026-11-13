import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import {
  Bone, CircleGeometry, CylinderGeometry, Euler, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3,
  type BufferGeometry, type Material,
} from 'three'
import { ParkAssetLoader } from '../world/art/assetLoader'
import { customerModelUrlV5 } from '../features/bungeoppang/customerAssetsV5'
import { instantiateCustomerV5 } from '../features/bungeoppang/customerModelV5'
import { RESIDENT_LOOKS, residentBoneName } from '../features/ai/residentRig'
import { blendTowardIdle, grandpaFreeze, sampleGrandpa, type BroomPose } from './grandpaPose'
import type { FinalePreview } from './JumpRopePreview'
import type { PreviewRound } from './previewRound'

/**
 * Story 420 stage 1 stand-in: the shared older-flat-cap resident with a jump-rope-only broom.
 * It never calls instantiateResident, so the shared cane and resident rig stay untouched.
 */
const look = RESIDENT_LOOKS.ELDER
export const grandpaHeight = 2.15
// A long yard broom: its sweep reaches past the avatar and up toward the audience on the wire.
// The handle and the straw keep the earlier proportions: the bristles end 2 m from the grip.
const handleBack = 0.3
const handleFront = 1.5
const bristleLength = 0.5
const leftHandAlong = 0.3
/** His everyday stoop, bent across the three spine bones. */
const stoop = 0.28
const spineBones = [['Spine', 0.36], ['Spine1', 0.34], ['Spine2', 0.3]] as const
const headBones = [['Neck', 0.45], ['Head', 0.55]] as const
const armBones = ['RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand'] as const
const posedBones = [...spineBones.map(([name]) => name), ...headBones.map(([name]) => name), ...armBones]

/** A low-poly bundled straw broom. Everything hangs off one group, so the handle and the straw move as one piece. */
function createBroom() {
  const geometries: BufferGeometry[] = []
  const materials = new Map<string, MeshStandardMaterial>()
  const group = new Group()
  group.name = 'grandpa-broom'
  function material(color: string) {
    let found = materials.get(color)
    if (!found) {
      found = new MeshStandardMaterial({ color, roughness: 0.92, flatShading: true })
      materials.set(color, found)
    }
    return found
  }
  /** A cylinder along +Z from `from` to `from + length`, optionally fanned about the handle's side axis. */
  function part(geometry: BufferGeometry, color: string, from: number, length: number, fan = 0, flatten = 1) {
    geometries.push(geometry)
    const pivot = new Group()
    pivot.position.z = from
    pivot.rotation.y = fan
    const mesh = new Mesh(geometry, material(color))
    // Cylinders run along +Y; turn them so the broom points along +Z from the grip.
    mesh.rotation.x = Math.PI / 2
    mesh.position.z = length / 2
    mesh.scale.z = flatten
    pivot.add(mesh)
    group.add(pivot)
  }
  const handle = handleBack + handleFront
  part(new CylinderGeometry(0.027, 0.03, handle, 8), '#8a5a35', -handleBack, handle)
  part(new CylinderGeometry(0.038, 0.034, 0.05, 8), '#5e3b22', -handleBack - 0.02, 0.05)
  // Straw bundle: a tight neck tied with twine and a red band, opening into a fan of clumps.
  const neck = handleFront - 0.1
  part(new CylinderGeometry(0.1, 0.05, 0.24, 8), '#c9a159', neck, 0.24, 0, 0.55)
  part(new CylinderGeometry(0.058, 0.058, 0.04, 8), '#6b3a26', neck + 0.02, 0.04, 0, 0.75)
  part(new CylinderGeometry(0.066, 0.066, 0.05, 8), '#a2382c', neck + 0.09, 0.05, 0, 0.7)
  part(new CylinderGeometry(0.072, 0.072, 0.04, 8), '#6b3a26', neck + 0.17, 0.04, 0, 0.65)
  const straw = ['#d8b468', '#c39a4e', '#e3c27a', '#b98d43']
  for (let clump = -3; clump <= 3; clump++) {
    const length = bristleLength + 0.02 - Math.abs(clump) * 0.025
    part(new CylinderGeometry(0.014, 0.034, length, 5), straw[(clump + 3) % straw.length]!, handleFront, length, clump * 0.13, 0.7)
  }
  return { group, geometries, materials: [...materials.values()] }
}

function createTell() {
  const group = new Group()
  group.name = 'grandpa-danger-tell'
  const geometries = [new CircleGeometry(0.17, 24), new CircleGeometry(0.035, 12), new CylinderGeometry(0.03, 0.022, 0.15, 8)]
  const back = new MeshBasicMaterial({ color: '#fff7ea', transparent: true, depthTest: false })
  const mark = new MeshBasicMaterial({ color: '#d8352a', transparent: true, depthTest: false })
  const disc = new Mesh(geometries[0], back)
  const dot = new Mesh(geometries[1], mark)
  const bar = new Mesh(geometries[2], mark)
  dot.position.set(0, -0.085, 0.002)
  bar.position.set(0, 0.035, 0.002)
  for (const mesh of [disc, dot, bar]) {
    mesh.renderOrder = 10
    group.add(mesh)
  }
  return { group, geometries, materials: [back, mark] }
}

const up = new Vector3(0, 1, 0)
const scratch = {
  shoulder: new Vector3(), elbow: new Vector3(), hand: new Vector3(), target: new Vector3(), pole: new Vector3(), grip: new Vector3(),
  from: new Vector3(), to: new Vector3(), axis: new Vector3(), delta: new Quaternion(), parent: new Quaternion(),
  world: new Quaternion(), frame: new Quaternion(), identity: new Quaternion(), partial: new Quaternion(), euler: new Euler(0, 0, 0, 'YXZ'),
}

/** Rotate `bone` in world space so the direction to `child` points at `target`. */
function aimBone(bone: Bone, child: Bone, target: Vector3, weight: number) {
  const { from, to, delta, parent, world, identity } = scratch
  bone.getWorldPosition(from)
  child.getWorldPosition(to)
  to.sub(from).normalize()
  from.subVectors(target, from).normalize()
  delta.setFromUnitVectors(to, from)
  // A partial weight blends from no turn toward the full turn. The target must not alias the result.
  if (weight < 1) delta.copy(scratch.partial.copy(identity).slerp(delta, weight))
  bone.getWorldQuaternion(world).premultiply(delta)
  bone.parent!.getWorldQuaternion(parent)
  bone.quaternion.copy(parent.invert().multiply(world))
  bone.updateMatrixWorld(true)
}

/** Two-bone reach: bend the elbow toward `poleLocal` (in the grandpa's frame) and land the hand on `target`. */
function reach(upper: Bone, lower: Bone, hand: Bone, target: Vector3, poleLocal: Vector3, frame: Group, weight: number) {
  const { shoulder, elbow, hand: wrist, pole, axis } = scratch
  upper.getWorldPosition(shoulder)
  lower.getWorldPosition(elbow)
  hand.getWorldPosition(wrist)
  const upperLength = shoulder.distanceTo(elbow)
  const lowerLength = elbow.distanceTo(wrist)
  axis.subVectors(target, shoulder)
  const distance = Math.min(upperLength + lowerLength - 1e-3, Math.max(Math.abs(upperLength - lowerLength) + 1e-3, axis.length()))
  axis.normalize()
  frame.getWorldQuaternion(scratch.frame)
  pole.copy(poleLocal).applyQuaternion(scratch.frame)
  pole.addScaledVector(axis, -pole.dot(axis))
  // When the reach lines up with the hint, the bend side is undefined; fall back to bending the elbow down.
  if (pole.lengthSq() < 0.04) {
    pole.set(0, -1, 0).applyQuaternion(scratch.frame)
    pole.addScaledVector(axis, -pole.dot(axis))
  }
  pole.normalize()
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance)
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2))
  elbow.copy(shoulder).addScaledVector(axis, along).addScaledVector(pole, height)
  aimBone(upper, lower, elbow, weight)
  aimBone(lower, hand, target, weight)
}

const rightPole = new Vector3(-0.7, -1, -0.5)
const leftPole = new Vector3(0.7, -1, -0.5)
const fistPole = new Vector3(1, -0.5, -0.5)
const side = new Vector3(1, 0, 0)
const forward = new Vector3(0, 0, 1)

/** Rotate `bone` about an axis given in the grandpa's frame, keeping its world pivot. */
function bendInFrame(bone: Bone, axisInFrame: Vector3, angle: number) {
  if (!bone.parent || angle === 0) return
  bone.parent.getWorldQuaternion(scratch.parent)
  scratch.axis.copy(axisInFrame).applyQuaternion(scratch.frame).applyQuaternion(scratch.parent.invert())
  bone.quaternion.premultiply(scratch.delta.setFromAxisAngle(scratch.axis, angle))
  bone.updateMatrixWorld(true)
}

export function GrandpaIntruder({ round, sceneTime, avatar, getFinalePreview }: {
  round: PreviewRound
  sceneTime: (now: number) => number
  avatar: { x: number; z: number }
  getFinalePreview: () => FinalePreview | null
}) {
  const source = useLoader(ParkAssetLoader, customerModelUrlV5(look.id))
  const built = useMemo(() => {
    const model = instantiateCustomerV5(source, { id: look.id, height: grandpaHeight })
    const frame = new Group()
    frame.name = 'tapgol-grandpa'
    frame.visible = false
    frame.add(model.root)
    const bones = new Map<string, Bone>()
    model.root.traverse(object => { if (object instanceof Bone) bones.set(residentBoneName(object.name), object) })
    const rest = new Map(posedBones.flatMap(name => {
      const bone = bones.get(name)
      return bone ? [[name, bone.quaternion.clone()] as const] : []
    }))
    const broom = createBroom()
    const tell = createTell()
    tell.group.position.y = grandpaHeight + 0.36
    frame.add(broom.group, tell.group)
    return { model, frame, bones, rest, broom, tell }
  }, [source])

  // The shout is a DOM bubble over the canvas, so the Korean text stays crisp at any size.
  const gl = useThree(state => state.gl)
  const speech = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const host = gl.domElement.parentElement
    if (!host) return
    const element = document.createElement('div')
    element.className = 'grandpa-speech'
    element.setAttribute('aria-hidden', 'true')
    element.hidden = true
    host.appendChild(element)
    speech.current = element
    return () => {
      element.remove()
      speech.current = null
    }
  }, [gl])

  useEffect(() => () => {
    built.model.dispose()
    for (const part of [built.broom, built.tell]) {
      part.geometries.forEach(geometry => geometry.dispose())
      part.materials.forEach((material: Material) => material.dispose())
    }
  }, [built])

  useFrame(({ camera, size }, delta) => {
    const { model, frame, bones, rest, broom, tell } = built
    const grandpa = round.ranked ? undefined : round.grandpa
    // The third MISS removes him at once, so the pigeons' game-over finale plays alone.
    const sample = grandpa && !round.endReason && !getFinalePreview()
      ? sampleGrandpa(grandpa, round.playedMs, avatar)
      : null
    frame.visible = sample !== null
    const bubble = speech.current
    if (bubble) bubble.hidden = !sample || sample.shoutWeight < 0.01
    if (!sample) return
    const now = sceneTime(performance.now())
    const freeze = grandpaFreeze(round, now)
    const pose: BroomPose = blendTowardIdle(sample.broom, freeze)
    frame.position.set(sample.x, 0, sample.z)
    frame.rotation.y = sample.facing - sample.broom.turn + pose.turn

    const walking = sample.walking && freeze < 0.5
    model.play(walking ? 'walk' : 'idle')
    model.mixer.timeScale = walking ? sample.walkSpeed / 1.6 : 1
    for (const [name, quaternion] of rest) bones.get(name)!.quaternion.copy(quaternion)
    model.update(delta, 0, sample.opacity)
    frame.updateMatrixWorld(true)

    // A stooped back that bends further into each swing, a torso that winds with the broom,
    // and a head that stays up to glare at the pigeons (or mutters on the way out).
    frame.getWorldQuaternion(scratch.frame)
    const awake = 1 - freeze
    const gesture = sample.gesture
    const bend = stoop + pose.lean + gesture.stoop * awake
    for (const [name, share] of spineBones) {
      const bone = bones.get(name)
      if (!bone) continue
      bendInFrame(bone, up, pose.twist * share)
      bendInFrame(bone, side, bend * share)
      bendInFrame(bone, forward, -(pose.tilt + gesture.sway * awake) * share)
    }
    for (const [name, share] of headBones) {
      const bone = bones.get(name)
      if (!bone) continue
      // Keep looking ahead: undo most of the stoop and some of the coil, then add the mutter and the glare.
      bendInFrame(bone, up, (-0.55 * pose.twist + gesture.headShake * awake) * share)
      bendInFrame(bone, side, -(0.8 * bend + gesture.glare * awake) * share)
    }

    // The broom grip turns with the torso; its direction is set in the grandpa's frame.
    broom.group.position.copy(scratch.grip.set(pose.gripX, pose.gripY, pose.gripZ).applyAxisAngle(up, pose.twist))
    broom.group.quaternion.setFromEuler(scratch.euler.set(-pose.pitch, pose.yaw, pose.roll, 'YXZ'))
    broom.group.updateMatrixWorld(true)
    const rightArm = bones.get('RightArm'), rightFore = bones.get('RightForeArm'), rightHand = bones.get('RightHand')
    if (rightArm && rightFore && rightHand) {
      broom.group.localToWorld(scratch.target.set(0, 0, 0))
      reach(rightArm, rightFore, rightHand, scratch.target, rightPole, frame, 1)
    }
    const leftArm = bones.get('LeftArm'), leftFore = bones.get('LeftForeArm'), leftHand = bones.get('LeftHand')
    if (leftArm && leftFore && leftHand && pose.twoHands > 0.01) {
      broom.group.localToWorld(scratch.target.set(0, 0, leftHandAlong))
      reach(leftArm, leftFore, leftHand, scratch.target, leftPole, frame, Math.min(1, pose.twoHands))
    } else if (leftArm && leftFore && leftHand && gesture.fist * awake > 0.01) {
      // The free hand shakes a fist at the pigeons while he stomps in, and a little on the way out.
      frame.localToWorld(scratch.target.set(0.42, 1.95 + 0.09 * gesture.fistShake, 0.28 + 0.05 * gesture.fistShake))
      reach(leftArm, leftFore, leftHand, scratch.target, fistPole, frame, Math.min(1, gesture.fist * awake))
    }

    for (const material of broom.materials) {
      const transparent = sample.opacity < 1
      if (material.transparent !== transparent) {
        material.transparent = transparent
        material.needsUpdate = true
      }
      material.opacity = sample.opacity
    }
    if (bubble && !bubble.hidden) {
      if (bubble.textContent !== sample.shout) bubble.textContent = sample.shout
      // Anchor the bubble's tail just above his cap, leaving the red tell's spot clear.
      frame.localToWorld(scratch.target.set(0.1, grandpaHeight + 0.08, 0)).project(camera)
      const x = (scratch.target.x + 1) / 2 * size.width
      const y = (1 - scratch.target.y) / 2 * size.height
      bubble.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-100%, -100%) scale(${(0.55 + 0.45 * sample.shoutWeight).toFixed(3)})`
      bubble.style.opacity = Math.min(1, sample.shoutWeight * 1.5).toFixed(3)
    }

    const warning = sample.warning * (1 - freeze)
    tell.group.visible = warning > 0.01
    if (tell.group.visible) {
      frame.getWorldQuaternion(scratch.world)
      tell.group.quaternion.copy(scratch.world.invert().multiply(camera.quaternion))
      tell.group.scale.setScalar(warning * (1 + 0.12 * Math.sin(now * 0.025)))
      for (const material of tell.materials) material.opacity = Math.min(1, warning * 1.2)
    }
  })

  return <primitive object={built.frame} dispose={null} />
}
