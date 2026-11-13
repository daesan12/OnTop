import { useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh, PerspectiveCamera, Vector3, type Group, type Material } from 'three'
import { PigeonActor, pigeonHeadPivot, type PigeonLook, type PigeonRig } from './PigeonActor'
import { manholeFootprint } from './AlleyManhole'
import { courtSurfaceHeight } from './ConcreteCourt'
import type { DistractionPose } from './pigeonDistractionMotion'

const up = new Vector3(0, 1, 0)
const intruderPose = { eyelids: [0.32, 0.56] as [number, number], gaze: [0.28, -0.12] as [number, number] }
const shaftSurface = courtSurfaceHeight(manholeFootprint.x, manholeFootprint.z)

export function PigeonDistraction({ poseRef, shadow, look = 'ash', lift = 0, nearer = 0 }: {
  poseRef: RefObject<DistractionPose | null>
  shadow?: ReactNode
  /** A second, overlapping distraction uses another plumage so the two pigeons read apart. */
  look?: PigeonLook
  /** Second-track offsets: a higher flight and a nearer walk keep two overlapping pigeons apart. */
  lift?: number
  nearer?: number
}) {
  const actor = useRef<Group>(null)
  const shadowGroup = useRef<Group>(null)
  const rigRef = useRef<PigeonRig>(null)
  const materials = useRef<Material[]>([])
  const vectors = useMemo(() => ({
    right: new Vector3(), near: new Vector3(), hip: new Vector3(), ankle: new Vector3(), shin: new Vector3(), exit: new Vector3(),
  }), [])

  useLayoutEffect(() => {
    actor.current?.traverse(object => {
      if (object instanceof Mesh) materials.current.push(...(Array.isArray(object.material) ? object.material : [object.material]))
    })
    return () => { materials.current = [] }
  }, [])

  useFrame(({ camera }) => {
    const group = actor.current
    const rig = rigRef.current
    const pose = poseRef.current
    if (!group || !rig) return
    // The poop raid is flown by an audience pigeon in the scene, not by this intruder.
    group.visible = pose !== null && pose.kind !== 'poop' && (pose.kind !== 'manhole' || pose.bird !== null)
    if (shadowGroup.current) shadowGroup.current.visible = pose?.kind === 'walk' && pose.opacity > 0.45
    if (!group.visible || !pose || pose.kind === 'poop') return

    camera.updateWorldMatrix(true, false)
    const { right, near, hip, ankle, shin, exit } = vectors
    const { body, legs } = rig
    right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize()
    near.setFromMatrixColumn(camera.matrixWorld, 2).setY(0).normalize()
    group.scale.setScalar(pose.scale)
    rig.jaw.rotation.x = 0

    function setLeg(index: number, { y, z, pitch }: { y: number; z: number; pitch: number }) {
      const leg = legs[index]
      if (!leg) return
      const x = index === 0 ? -0.145 : 0.145
      leg.foot.position.set(x, y, z)
      leg.foot.rotation.x = pitch
      hip.set(x, 0.197, 0.015).applyQuaternion(body.quaternion).add(body.position)
      ankle.set(0, 0.023, 0.015).applyQuaternion(leg.foot.quaternion).add(leg.foot.position)
      leg.shin.position.copy(hip).lerp(ankle, 0.5)
      shin.subVectors(hip, ankle)
      leg.shin.scale.y = shin.length() / 0.174
      leg.shin.quaternion.setFromUnitVectors(up, shin.normalize())
    }

    if (pose.kind === 'flight' && camera instanceof PerspectiveCamera) {
      const halfHeight = Math.tan(camera.getEffectiveFOV() * Math.PI / 360) * pose.depth
      const halfWidth = halfHeight * camera.aspect
      // Both ends lie outside the frustum even with fully spread wings.
      group.position.set(pose.cross * (halfWidth + pose.scale * 1.15), pose.height + lift - pose.scale * 0.48, -pose.depth)
        .applyMatrix4(camera.matrixWorld)
      group.rotation.y = Math.atan2(right.x * pose.direction + near.x * 0.55, right.z * pose.direction + near.z * 0.55)
      rig.body.position.set(0, 0.025 * pose.flap, 0)
      rig.body.rotation.set(0.08 + 0.07 * pose.flap, 0, pose.bank * pose.direction)
      rig.head.position.set(...pigeonHeadPivot)
      rig.head.rotation.set(-0.12 - 0.09 * pose.flap, -0.23 * pose.direction, -0.12 * pose.bank)
      // Open the folded wings about Y first, then raise and lower the spread about Z.
      rig.leftWing.rotation.set(-0.12, 1.43 + 0.13 * pose.flap, 0.06 + 0.9 * pose.flap, 'ZXY')
      rig.rightWing.rotation.set(-0.12, -1.43 - 0.13 * pose.flap, -0.06 - 0.9 * pose.flap, 'ZXY')
      setLeg(0, { y: 0.14, z: -0.17, pitch: 0.45 })
      setLeg(1, { y: 0.14, z: -0.17, pitch: 0.45 })
    } else if (pose.kind === 'walk') {
      group.position.copy(right).multiplyScalar(pose.across).addScaledVector(near, pose.depth + nearer)
      group.position.z -= 0.18
      group.position.y = 0.004
      group.rotation.y = Math.atan2(right.x * pose.direction, right.z * pose.direction)
      if (shadowGroup.current) {
        shadowGroup.current.position.copy(group.position)
        shadowGroup.current.scale.setScalar(pose.scale)
      }
      rig.body.position.set(0, pose.bob, 0)
      rig.body.rotation.set(0.045, -pose.sway * 0.6, pose.sway)
      rig.head.position.set(pigeonHeadPivot[0], pigeonHeadPivot[1], pigeonHeadPivot[2] + pose.head)
      rig.head.rotation.set(-0.035 + pose.head * 1.4, pose.direction * 0.15, -pose.sway * 0.65)
      rig.leftWing.rotation.set(0, 0, 0)
      rig.rightWing.rotation.set(0, 0, 0)
      setLeg(0, pose.left)
      setLeg(1, pose.right)
    } else if (pose.kind === 'manhole' && pose.bird && camera instanceof PerspectiveCamera) {
      const { rise, approach, spread, flap, oppositeFlap, wobble } = pose.bird
      const { direction, scale } = pose
      const turn = rise ** 2
      const riseHeight = rise + 0.22 * Math.sin(Math.PI * rise)
      group.position.set(manholeFootprint.x + 0.25 * direction * turn, shaftSurface - 0.63 + 1.49 * riseHeight,
        manholeFootprint.z + 0.18 * turn)
      const depth = 2.25
      const halfHeight = Math.tan(camera.getEffectiveFOV() * Math.PI / 360) * depth
      exit.set(direction * (halfHeight * camera.aspect + scale * 1.22), halfHeight * 0.71, -depth)
        .applyMatrix4(camera.matrixWorld)
      group.position.lerp(exit, approach)
      group.position.y += 0.45 * Math.sin(Math.PI * approach)
      group.rotation.y = Math.atan2(near.x + right.x * direction * approach, near.z + right.z * direction * approach)

      rig.body.position.set(0, 0.026 * flap * spread, 0)
      rig.body.rotation.set(-0.17 * (1 - approach) + flap * spread * 0.09, 0, wobble * spread * 0.22)
      rig.head.position.set(...pigeonHeadPivot)
      rig.head.rotation.set(-0.22 + oppositeFlap * spread * 0.14, direction * 0.24 * approach, wobble * 0.16 * spread)
      rig.jaw.rotation.x = 0.21 + 0.12 * spread * oppositeFlap
      rig.leftWing.rotation.set(-0.14 * spread, 1.52 * spread, (0.12 + flap * 1.03) * spread, 'ZXY')
      rig.rightWing.rotation.set(-0.14 * spread, -1.52 * spread, (-0.12 - oppositeFlap * 1.03) * spread, 'ZXY')
      setLeg(0, { y: 0.13, z: -0.15, pitch: 0.43 })
      setLeg(1, { y: 0.13, z: -0.15, pitch: 0.48 })
    }

    const opacity = pose.kind === 'walk' ? pose.opacity : 1
    for (const material of materials.current) {
      if (material.transparent !== (opacity < 1)) {
        material.transparent = opacity < 1
        material.needsUpdate = true
      }
      material.opacity = opacity
    }
  })

  return (
    <>
      <group ref={shadowGroup} visible={false}>{shadow}</group>
      <group ref={actor} name="pigeon-distraction" visible={false}>
        <PigeonActor look={look} pose={intruderPose} rigRef={rigRef} />
      </group>
    </>
  )
}
