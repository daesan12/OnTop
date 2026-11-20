import {
  Bone,
  BufferGeometry,
  Euler,
  Group,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Sphere,
  Vector3,
} from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { CHARACTER, CLAP_EMOTE } from '../../config'
import { createSoleSupport } from './soleSupport'
import { coveredTokens, defaultLook, drawnVertices, pieceGeometry, pieceShown, type CharacterVariant, type Look, type PieceRange } from './characterLook'

export { characterUrls } from './characterAssets'
const bodyBones = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'clavicle_L',
  'clavicle_R',
  'upperArm_L',
  'lowerArm_L',
  'hand_L',
  'upperArm_R',
  'lowerArm_R',
  'hand_R',
  'upperLeg_L',
  'lowerLeg_L',
  'foot_L',
  'upperLeg_R',
  'lowerLeg_R',
  'foot_R',
] as const
export const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const
export type Side = 'L' | 'R'
type FingerJoint = `${(typeof fingers)[number]}${1 | 2 | 3}_${Side}`
export type CharacterJoint = (typeof bodyBones)[number] | FingerJoint
export const characterBones: readonly CharacterJoint[] = [
  ...bodyBones,
  ...(['L', 'R'] as const).flatMap((side) =>
    fingers.flatMap((finger) =>
      ([1, 2, 3] as const).map(
        (joint): FingerJoint => `${finger}${joint}_${side}`,
      ),
    ),
  ),
]
type Joint = CharacterJoint
const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function armSurface(mesh: SkinnedMesh) {
  const { geometry, skeleton } = mesh
  const index = geometry.index
  const weights = geometry.getAttribute('skinWeight')
  const joints = geometry.getAttribute('skinIndex')
  const armJoints = skeleton.bones.map(joint => {
    let bone: Bone | null = joint
    while (bone instanceof Bone) {
      if (bone.name === 'upperArm_L' || bone.name === 'upperArm_R') return true
      bone = bone.parent as Bone | null
    }
    return false
  })
  const isArm = new Uint8Array(weights.count)
  for (const vertex of drawnVertices(geometry)) {
    let weight = 0
    for (let i = 0; i < 4; i++) {
      if (armJoints[joints.getComponent(vertex, i)]) weight += weights.getComponent(vertex, i)
    }
    isArm[vertex] = Number(weight >= .5)
  }
  const armTriangles: number[] = []
  const result = new BufferGeometry()
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index?.count ?? weights.count, materialIndex: 0 }]
  for (const group of groups) {
    const start = armTriangles.length
    for (let offset = group.start; offset < group.start + group.count; offset += 3) {
      const a = index?.getX(offset) ?? offset, b = index?.getX(offset + 1) ?? offset + 1
      const c = index?.getX(offset + 2) ?? offset + 2
      if (isArm[a] && isArm[b] && isArm[c]) armTriangles.push(a, b, c)
    }
    result.addGroup(start, armTriangles.length - start, group.materialIndex)
  }
  // Retain the current outfit, skinning and material layout when hiding the rest of the body.
  for (const [name, attribute] of Object.entries(geometry.attributes)) result.setAttribute(name, attribute)
  result.morphAttributes = geometry.morphAttributes
  result.morphTargetsRelative = geometry.morphTargetsRelative
  result.setIndex(armTriangles)
  return result
}

/** One private skeleton per player, shared immutable geometry/material/texture caches.
 * Parts use one skeleton even across LODs; swapping detail cannot reset the pose.
 * `look` picks the worn pieces (characterLook.ts); `sources` holds the files other than the avatar's own
 * that those pieces come from (another character's default items, outfit files). */
export function createCharacterRig(source: GLTF, look?: Look, sources?: ReadonlyMap<string, GLTF>) {
  const root = clone(source.scene) as Group
  root.name = 'character-model'
  const variant = (root.getObjectByName('CharacterRig')?.userData.variant === 'girl' ? 'girl' : 'man') as CharacterVariant
  const worn = look ?? defaultLook(variant)
  const covered = coveredTokens(worn, sources)
  const pieces = (mesh: SkinnedMesh, from: string) => {
    const ranges = mesh.userData.pieces as PieceRange[] | undefined
    return ranges ? pieceGeometry(mesh.geometry, ranges, name => pieceShown(name, from, variant, worn, covered)) : mesh.geometry
  }
  const bones = Object.fromEntries(
    characterBones.map((name) => {
      const bone = root.getObjectByName(name)
      if (!(bone instanceof Bone))
        throw new Error(`Character is missing bone ${name}`)
      return [name, bone]
    }),
  ) as Record<Joint, Bone>
  const meshes: SkinnedMesh[] = []
  const prepare = (mesh: SkinnedMesh) => {
    meshes.push(mesh)
    mesh.castShadow = true
    mesh.boundingSphere = new Sphere(new Vector3(0, 0.85, 0), 1.5)
    mesh.visible = mesh.name.startsWith('near-')
  }
  root.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) return
    object.geometry = pieces(object, variant)
    prepare(object)
  })
  if (meshes.length !== 10 && meshes.length !== 2)
    throw new Error('Expected complete character surfaces at two LODs')
  const fittedGestures =
    root.getObjectByName('CharacterRig')?.userData.sourceRig === 'Mixamo65'
  const skeleton = meshes[0]!.skeleton
  for (const mesh of meshes) mesh.skeleton = skeleton
  // Pieces from other files: their own mesh on this avatar's bones (same 49 joints, their own bind matrices).
  const extraSkeletons: Skeleton[] = []
  for (const [from, gltf] of sources ?? []) {
    if (from === variant) continue
    gltf.scene.traverse((object) => {
      if (!(object instanceof SkinnedMesh) || !object.userData.pieces) return
      const geometry = pieces(object, from)
      if (!geometry.index?.count) return
      const mesh = new SkinnedMesh(geometry, object.material)
      mesh.name = `${object.name.split('-')[0]}-${from}`
      const bound = new Skeleton(object.skeleton.bones.map((bone) => bones[bone.name as Joint]), object.skeleton.boneInverses)
      extraSkeletons.push(bound)
      meshes[0]!.parent!.add(mesh)
      mesh.bind(bound, object.bindMatrix)
      prepare(mesh)
    })
  }
  const updateSkeletons = () => {
    skeleton.update()
    for (const bound of extraSkeletons) bound.update()
  }
  const seatedCloth = meshes.flatMap((mesh) => {
    const index = mesh.morphTargetDictionary?.seatedCloth
    return index === undefined ? [] : [{ mesh, index }]
  })
  // The pelvis joint is inside the body, not on the seat-contact surface.
  // Calibrate once against the shipped skin + seated clothing morph, per rig.
  const { seatedHipLift, seatedContactLift } = (() => {
    for (const side of ['L', 'R'] as const) {
      bones[`upperLeg_${side}`].rotation.x = -Math.PI / 2
      bones[`lowerLeg_${side}`].rotation.x = Math.PI / 2
    }
    for (const { mesh, index } of seatedCloth) mesh.morphTargetInfluences![index] = 1
    root.updateMatrixWorld(true)
    updateSkeletons()
    const point = new Vector3(), hip = bones.hips.position.y
    let bottom = Infinity, thighBottom = Infinity
    for (const mesh of meshes) {
      if (!mesh.name.startsWith('near-')) continue
      const p = mesh.geometry.getAttribute('position')
      const weights = mesh.geometry.getAttribute('skinWeight'), indices = mesh.geometry.getAttribute('skinIndex')
      for (const i of drawnVertices(mesh.geometry)) {
        const height = p.getY(i)
        if (height < hip - 0.4 || height > hip + 0.1) continue
        let pelvisWeight = 0, thighWeight = 0
        for (let j = 0; j < 4; j++) {
          const name = mesh.skeleton.bones[indices.getComponent(i, j)]!.name
          const weight = weights.getComponent(i, j)
          if (name === 'hips' || name === 'spine') pelvisWeight += weight
          else if (name === 'upperLeg_L' || name === 'upperLeg_R') thighWeight += weight
        }
        const pelvis = height >= hip - 0.2 && pelvisWeight >= 0.65
        // Broad, solid seats also support the underside of the upper legs.
        const thigh = thighWeight >= 0.65
        if (!pelvis && !thigh) continue
        mesh.getVertexPosition(i, point)
        if (pelvis) bottom = Math.min(bottom, point.y)
        if (thigh) thighBottom = Math.min(thighBottom, point.y)
      }
    }
    for (const side of ['L', 'R'] as const) {
      bones[`upperLeg_${side}`].rotation.x = 0
      bones[`lowerLeg_${side}`].rotation.x = 0
    }
    for (const { mesh, index } of seatedCloth) mesh.morphTargetInfluences![index] = 0
    root.updateMatrixWorld(true)
    updateSkeletons()
    const lift = (contact: number) => Number.isFinite(contact)
      ? Math.max(0, Math.min(0.25, hip - contact)) + 0.008 : 0
    return { seatedHipLift: lift(bottom), seatedContactLift: lift(Math.min(bottom, thighBottom)) }
  })()
  const shoes = meshes.find((mesh) => mesh.name === 'near-shoes-socks')
  // Lowest rest vertex in each sole cell, over the worn near surfaces. A few dozen
  // weighted samples rather than a per-frame bounding-box pass over every vertex.
  const soleCells = new Map<string, { mesh: SkinnedMesh; i: number; y: number }>()
  for (const mesh of shoes ? [shoes] : meshes.filter((mesh) => mesh.name.startsWith('near-'))) {
    const positions = mesh.geometry.getAttribute('position')
    for (const i of drawnVertices(mesh.geometry)) {
      const y = positions.getY(i)
      if (y > 0.045) continue
      const key = `${Math.floor(positions.getX(i) / 0.045)},${Math.floor(positions.getZ(i) / 0.045)}`
      const previous = soleCells.get(key)
      if (previous === undefined || y < previous.y) soleCells.set(key, { mesh, i, y })
    }
  }
  const soleIndices = new Map<SkinnedMesh, number[]>()
  for (const { mesh, i } of soleCells.values()) {
    const indices = soleIndices.get(mesh)
    if (indices) indices.push(i)
    else soleIndices.set(mesh, [i])
  }
  const soleSupports = Array.from(soleIndices, ([mesh, indices]) => createSoleSupport(mesh, indices))
  const target = new Quaternion()
  const euler = new Euler()
  const rotations = new Float32Array(characterBones.length * 3)
  const tracking = new Float32Array(characterBones.length)
  const indices = Object.fromEntries(
    characterBones.map((name, i) => [name, i * 3]),
  ) as Record<Joint, number>
  let far = false
  let rideHands = false
  let rideSurfaces: { mesh: SkinnedMesh; full: BufferGeometry; hands: BufferGeometry }[] | undefined
  const rideJoints = (['L', 'R'] as const).flatMap(side =>
    [bones[`upperArm_${side}`], bones[`lowerArm_${side}`], bones[`hand_${side}`]])
  const originalRidePositions = rideJoints.map(joint => joint.position.clone())
  function set(name: Joint, x = 0, y = 0, z = 0) {
    const i = indices[name]
    rotations[i] = x
    rotations[i + 1] = y
    rotations[i + 2] = z
  }
  function handPose(
    side: Side,
    pose: 'open' | 'cup' | 'point' | 'relaxed' | 'fist',
    blend = 1,
  ) {
    for (const finger of fingers) {
      const curl =
        pose === 'open' || (pose === 'point' && finger === 'index')
          ? 0.025
          : pose === 'cup'
            ? finger === 'thumb'
              ? 0.12
              : 0.065
            : pose === 'relaxed'
              ? 0.16
              : finger === 'thumb'
                ? 0.5
                : 1
      for (const joint of [1, 2, 3] as const)
        set(
          `${finger}${joint}_${side}`,
          0,
          0,
          (side === 'L' ? -1 : 1) *
            (0.16 + (curl - 0.16) * blend) *
            (joint === 2 ? 1.1 : joint === 3 ? 0.7 : 0.85),
        )
    }
  }
  // Two-bone IK in the shared bind frame. Arm lengths come from the actual asset,
  // and the outward elbow pole prevents the forearms crossing through the torso.
  const armData = Object.fromEntries(
    (['L', 'R'] as const).map((side) => {
      const shoulder = new Vector3()
      let bone: Bone | null = bones[`upperArm_${side}`]
      while (bone instanceof Bone) {
        shoulder.add(bone.position)
        bone = bone.parent as Bone | null
      }
      return [
        side,
        {
          shoulder,
          upper: bones[`lowerArm_${side}`].position.clone(),
          lower: bones[`hand_${side}`].position.clone(),
          upperAxis: bones[`lowerArm_${side}`].position.clone().normalize(),
          lowerAxis: bones[`hand_${side}`].position.clone().normalize(),
        },
      ]
    }),
  ) as Record<
    Side,
    {
      shoulder: Vector3
      upper: Vector3
      lower: Vector3
      upperAxis: Vector3
      lowerAxis: Vector3
    }
  >
  const direction = new Vector3(),
    pole = new Vector3(),
    elbow = new Vector3()
  const upperDirection = new Vector3(),
    lowerDirection = new Vector3()
  const shoulderQ = new Quaternion(),
    elbowQ = new Quaternion(),
    wristQ = new Quaternion()
  function writeQuaternion(name: Joint, q: Quaternion, blend: number) {
    const i = indices[name]
    // Blend from this frame's base pose, including seated arms and locomotion.
    target.setFromEuler(
      euler.set(rotations[i]!, rotations[i + 1]!, rotations[i + 2]!),
    )
    target.slerp(q, blend)
    euler.setFromQuaternion(target)
    set(name, euler.x, euler.y, euler.z)
    tracking[i / 3] = blend
  }
  function reachHand(
    side: Side,
    x: number,
    y: number,
    z: number,
    wristX: number,
    wristY: number,
    wristZ: number,
    blend = 1,
    fitGesture = fittedGestures,
  ) {
    const arm = armData[side],
      sign = side === 'L' ? 1 : -1
    // Supplied T-pose models have shorter arms and larger hands than the older
    // repaired models. Fit gesture paths into their reachable chest-space arc.
    // Keep the central clap gap unchanged so both palms can meet.
    if (fitGesture) {
      if (Math.abs(x) > 0.12) x *= 0.7
      y = arm.shoulder.y + 0.015 + (y - 0.85) * 0.75
      z *= 0.6
    }
    const a = arm.upper.length(),
      b = arm.lower.length()
    direction.set(x, y, z).sub(arm.shoulder)
    const distance = Math.max(
      Math.abs(a - b) + 0.001,
      Math.min(a + b - 0.001, direction.length()),
    )
    direction.normalize()
    pole
      .set(sign * 0.5, -1, -0.12)
      .addScaledVector(direction, -pole.dot(direction))
      .normalize()
    const along = (a * a - b * b + distance * distance) / (2 * distance)
    elbow
      .copy(arm.shoulder)
      .addScaledVector(direction, along)
      .addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)))
    upperDirection.copy(elbow).sub(arm.shoulder).normalize()
    shoulderQ.setFromUnitVectors(arm.upperAxis, upperDirection)
    lowerDirection
      .copy(arm.shoulder)
      .addScaledVector(direction, distance)
      .sub(elbow)
      .normalize()
    // Solve the elbow in shoulder space. Independent world-space shortest arcs
    // introduce an unrelated forearm roll and collapse the blended sleeve.
    lowerDirection.applyQuaternion(target.copy(shoulderQ).invert())
    elbowQ.setFromUnitVectors(arm.lowerAxis, lowerDirection)
    wristQ.setFromEuler(euler.set(wristX, wristY, wristZ))
    wristQ.premultiply(target.copy(shoulderQ).multiply(elbowQ).invert())
    writeQuaternion(`upperArm_${side}`, shoulderQ, blend)
    writeQuaternion(`lowerArm_${side}`, elbowQ, blend)
    writeQuaternion(`hand_${side}`, wristQ, blend)
  }
  return {
    root,
    bones,
    hipHeight: bones.hips.position.y,
    seatedHipLift,
    seatedContactLift,
    socialArmScale: fittedGestures ? 0.85 : 1,
    reset() {
      rotations.fill(0)
      tracking.fill(0)
      handPose('L', 'relaxed')
      handPose('R', 'relaxed')
    },
    set,
    handPose,
    reachHand,
    /** Equipment targets already use the actual model's local coordinates. */
    reachFitnessHand(side: Side, x: number, y: number, z: number, wristX: number, wristY: number, wristZ: number) {
      reachHand(side, x, y, z, wristX, wristY, wristZ, 1, false)
    },
    /** Exported Y-up, identity rest rotations; validated by the asset tests. */
    apply(delta: number) {
      const dt = Math.max(0, Math.min(delta, 0.1))
      const baseAlpha = 1 - Math.exp(-dt * 18)
      for (let i = 0; i < characterBones.length; i++) {
        euler.set(
          rotations[i * 3]!,
          rotations[i * 3 + 1]!,
          rotations[i * 3 + 2]!,
        )
        target.setFromEuler(euler)
        // Authored hand paths already ease in/out. Faster tracking preserves
        // contact in real playback; the old filter erased each clap.
        const alpha = tracking[i]!
          ? 1 - Math.exp(-dt * (18 + 30 * tracking[i]!))
          : baseAlpha
        bones[characterBones[i]!]!.quaternion.slerp(target, alpha)
      }
      const seatedBlend = ease(
        (Math.min(-bones.upperLeg_L.rotation.x, -bones.upperLeg_R.rotation.x) -
          0.6) /
          (Math.PI / 2 - 0.6),
      )
      for (const { mesh, index } of seatedCloth)
        mesh.morphTargetInfluences![index] = seatedBlend
    },
    showRideHands(enabled: boolean) {
      if (enabled === rideHands) return
      rideHands = enabled
      if (enabled) rideSurfaces ??= meshes.map(mesh => ({ mesh, full: mesh.geometry, hands: armSurface(mesh) }))
      for (const { mesh, full, hands } of rideSurfaces ?? []) mesh.geometry = enabled ? hands : full
      if (!enabled) rideJoints.forEach((joint, i) => joint.position.copy(originalRidePositions[i]!))
    },
    groundShift() {
      root.updateMatrixWorld(true)
      // CPU skinning reads bone.matrixWorld directly. The renderer uploads the
      // skeleton once for its render frame; no duplicate bone palette is needed here.
      let bottom = Infinity
      for (const support of soleSupports) bottom = Math.min(bottom, support())
      return Number.isFinite(bottom)
        ? Math.max(-0.2, Math.min(0.2, -bottom))
        : 0
    },
    lod(distance: number, crowdedXR = false) {
      // Preserve the closest faces and hand poses while reducing skinned geometry
      // sooner when many avatars are rendered for both eyes.
      const nearDistance = crowdedXR ? 4 : CHARACTER.nearDistance
      const farDistance = crowdedXR ? 6 : CHARACTER.farDistance
      const next =
        distance > farDistance
          ? true
          : distance < nearDistance
            ? false
            : far
      if (next === far) return
      far = next
      for (const mesh of meshes)
        mesh.visible = mesh.name.startsWith(far ? 'far-' : 'near-')
    },
    clap(age: number) {
      const blend = ease(age / 360) * ease((CLAP_EMOTE.durationMs - age) / 440)
      const phase = (Math.max(0, age - 300) % 620) / 620
      // Anticipate, close, hold contact briefly, then release more slowly.
      const close =
        ease((phase - 0.12) / 0.25) * (1 - ease((phase - 0.55) / 0.4))
      const gap = 0.027 + (1 - close) * 0.088
      for (const side of ['L', 'R'] as const) {
        reachHand(
          side,
          (side === 'L' ? 1 : -1) * gap,
          0.73 + (1 - close) * 0.012,
          0.23,
          Math.PI + 0.22,
          0,
          0,
          blend,
        )
        handPose(side, 'cup', blend)
      }
      set('head', -0.018 * close * blend)
    },
    dispose() {
      for (const { mesh, full, hands } of rideSurfaces ?? []) {
        mesh.geometry = full
        hands.dispose()
      }
      rideSurfaces = undefined
      rideHands = false
      skeleton.dispose()
      for (const bound of extraSkeletons) bound.dispose()
    },
  }
}
