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
const handleBack = 0.3
const handleFront = 1.5
const bristleLength = 0.5
const leftHandAlong = 0.4
const spineBones = [['Spine', 0.34], ['Spine1', 0.33], ['Spine2', 0.33]] as const
const armBones = ['RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand'] as const
const posedBones = [...spineBones.map(([name]) => name), ...armBones]

function createBroom() {
  const geometries: BufferGeometry[] = []
  const materials: MeshStandardMaterial[] = []
  const group = new Group()
  group.name = 'grandpa-broom'
  function part(geometry: BufferGeometry, color: string, z: number, scale?: [number, number, number]) {
    const material = new MeshStandardMaterial({ color, roughness: 0.9, flatShading: true })
    geometries.push(geometry)
    materials.push(material)
    const mesh = new Mesh(geometry, material)
    // Cylinders run along +Y; turn them so the broom points along +Z from the grip.
    mesh.rotation.x = Math.PI / 2
    mesh.position.z = z
    if (scale) mesh.scale.set(...scale)
    group.add(mesh)
  }
  part(new CylinderGeometry(0.024, 0.027, handleBack + handleFront, 10), '#8a5a35', (handleFront - handleBack) / 2)
  part(new CylinderGeometry(0.045, 0.052, 0.08, 10), '#a2382c', handleFront - 0.01)
  part(new CylinderGeometry(0.065, 0.23, bristleLength, 9), '#cfa95b', handleFront + bristleLength / 2, [1, 1, 0.34])
  part(new CylinderGeometry(0.06, 0.068, 0.04, 9), '#8b6a33', handleFront + 0.08, [1, 1, 0.4])
  return { group, geometries, materials }
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
  world: new Quaternion(), frame: new Quaternion(), identity: new Quaternion(), euler: new Euler(0, 0, 0, 'YXZ'),
}

/** Rotate `bone` in world space so the direction to `child` points at `target`. */
function aimBone(bone: Bone, child: Bone, target: Vector3, weight: number) {
  const { from, to, delta, parent, world, identity } = scratch
  bone.getWorldPosition(from)
  child.getWorldPosition(to)
  to.sub(from).normalize()
  from.subVectors(target, from).normalize()
  delta.setFromUnitVectors(to, from)
  if (weight < 1) delta.slerpQuaternions(identity, delta, weight)
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
  pole.addScaledVector(axis, -pole.dot(axis)).normalize()
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance)
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2))
  elbow.copy(shoulder).addScaledVector(axis, along).addScaledVector(pole, height)
  aimBone(upper, lower, elbow, weight)
  aimBone(lower, hand, target, weight)
}

const rightPole = new Vector3(-0.7, -1, -0.5)
const leftPole = new Vector3(0.7, -1, -0.5)

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

    // Torso turn about the grandpa's own vertical axis.
    frame.getWorldQuaternion(scratch.frame)
    for (const [name, share] of spineBones) {
      const bone = bones.get(name)
      if (!bone?.parent) continue
      bone.parent.getWorldQuaternion(scratch.parent)
      scratch.axis.copy(up).applyQuaternion(scratch.frame).applyQuaternion(scratch.parent.invert())
      bone.quaternion.premultiply(scratch.delta.setFromAxisAngle(scratch.axis, pose.twist * share))
      bone.updateMatrixWorld(true)
    }

    // The broom grip turns with the torso; its direction is set in the grandpa's frame.
    broom.group.position.copy(scratch.grip.set(pose.gripX, pose.gripY, pose.gripZ).applyAxisAngle(up, pose.twist))
    broom.group.quaternion.setFromEuler(scratch.euler.set(-pose.pitch, pose.yaw, 0, 'YXZ'))
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
