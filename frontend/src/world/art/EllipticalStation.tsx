import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, Vector3, type Group, type InstancedMesh } from 'three'
import {
  AVATAR,
  createFitnessMotion,
  sampleFitnessMotion,
  type FitnessStation,
} from '../../config'
import { avatars, estimatedServerTime } from '../../network/worldClient'
import { Instances, beam, type Part } from './Instances'
import { BeveledBox } from './BeveledBox'
import {
  fitnessColors,
  fitnessMetal,
  fitnessRubber,
  FitnessPostTrim,
} from './FitnessStyle'

const frame: Part[] = [
  beam([0, 0.1, -0.65], [0, 0.45, 0.7], 0.11, fitnessColors.frame),
  beam([-0.8, 0.1, -0.55], [0.8, 0.1, -0.55], 0.075, fitnessColors.frame),
]
for (const side of [-1, 1]) {
  frame.push(
    beam(
      [side * 0.8, 0.1, -0.7],
      [side * 0.8, 0.1, 0.9],
      0.09,
      fitnessColors.cream,
    ),
  )
  frame.push(
    beam(
      [side * 0.8, 0.1, 0.5],
      [side * 0.8, 1.35, 0.5],
      0.08,
      fitnessColors.frame,
    ),
  )
}
const pedal: Part[] = [
  { p: [0, -0.035, 0], s: [0.45, 0.07, 0.65], c: fitnessColors.rubber },
]
// The handle pivots about the same shoulder axis as the stylized avatar.
const handle: Part[] = [
  beam([0, 0, 0], [0, -0.1, 0.05], 0.035, fitnessColors.cream),
  beam([0, -0.1, 0.05], [0, -0.28, 0.05], 0.035, fitnessColors.cream),
  beam([-0.12, -0.28, 0.05], [0.12, -0.28, 0.05], 0.045, fitnessColors.frame),
]
export function EllipticalStation({ station }: { station: FitnessStation }) {
  const left = useRef<Group>(null),
    right = useRef<Group>(null),
    lh = useRef<Group>(null),
    rh = useRef<Group>(null),
    links = useRef<InstancedMesh>(null)
  const motion = useMemo(createFitnessMotion, [])
  const supports = useMemo(() => {
    const parts: Part[] = []
    const y = station.baseHeight + 1.08 * AVATAR.scale
    for (const side of [-1, 1]) {
      const x = side * 0.32 * AVATAR.scale
      parts.push(
        beam([side * 0.8, y, 0.5], [x, y, 0.5], 0.06, fitnessColors.cream),
        beam([x, y, 0.5], [x, y, 0], 0.06, fitnessColors.cream),
      )
    }
    return parts
  }, [station.baseHeight])
  const linkage = useMemo(() => {
    const from = new Vector3(),
      to = new Vector3(),
      direction = new Vector3(),
      up = new Vector3(0, 1, 0),
      transform = new Object3D()
    return {
      from,
      to,
      connect(index: number) {
        if (!links.current) return
        direction.subVectors(to, from)
        const length = direction.length()
        transform.position.copy(from).add(to).multiplyScalar(0.5)
        transform.quaternion.setFromUnitVectors(up, direction.normalize())
        transform.scale.set(0.035, length, 0.035)
        transform.updateMatrix()
        links.current.setMatrixAt(index, transform.matrix)
      },
    }
  }, [])
  useFrame(() => {
    let start = 0
    for (const a of avatars.values())
      if (a.fitnessId === station.id && a.connected) {
        start = a.fitnessStartedAt
        break
      }
    sampleFitnessMotion(
      'elliptical',
      start,
      start ? estimatedServerTime() : 0,
      motion,
    )
    if (left.current)
      left.current.position.set(
        -AVATAR.legOffset * AVATAR.scale,
        station.baseHeight + (0.6 + motion.leftPedalY) * AVATAR.scale,
        motion.leftPedalZ * AVATAR.scale,
      )
    if (right.current)
      right.current.position.set(
        AVATAR.legOffset * AVATAR.scale,
        station.baseHeight + (0.6 + motion.rightPedalY) * AVATAR.scale,
        motion.rightPedalZ * AVATAR.scale,
      )
    lh.current?.rotation.set(motion.leftArm, 0, motion.armZ)
    rh.current?.rotation.set(motion.rightArm, 0, -motion.armZ)
    // Both ends follow the rendered handle/pedal transforms, including lateral tilt.
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1
      const grip = i === 0 ? lh.current : rh.current
      const foot = i === 0 ? left.current : right.current
      if (!grip || !foot) continue
      const x = side * (AVATAR.legOffset * AVATAR.scale + 0.195)
      linkage.from
        .set(side * 0.1, -0.28, 0.05)
        .multiply(grip.scale)
        .applyEuler(grip.rotation)
        .add(grip.position)
      linkage.to.set(x, foot.position.y - 0.035, foot.position.z + 0.15)
      linkage.connect(i * 2)
      linkage.from.set(side * 0.14, 0.38, -0.55)
      linkage.to.set(x, foot.position.y - 0.035, foot.position.z - 0.18)
      linkage.connect(i * 2 + 1)
    }
    if (links.current) links.current.instanceMatrix.needsUpdate = true
  })
  return (
    <group
      name={station.id}
      position={station.position}
      rotation={[0, station.yaw, 0]}
    >
      <FitnessPostTrim parts={frame} />
      <Instances parts={frame} material={fitnessMetal}>
        <cylinderGeometry args={[1, 1, 1, 10]} />
      </Instances>
      <Instances parts={supports} material={fitnessMetal}>
        <cylinderGeometry args={[1, 1, 1, 10]} />
      </Instances>
      <instancedMesh
        ref={links}
        name="elliptical-moving-linkages"
        args={[undefined, undefined, 4]}
        frustumCulled={false}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[1, 1, 1, 10]} />
        <meshStandardMaterial color={fitnessColors.cream} roughness={1} />
      </instancedMesh>
      <mesh position={[0, 0.38, -0.55]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.35, 0.35, 0.3, 24]} />
        <meshStandardMaterial
          color={fitnessColors.frame}
          metalness={0.38}
          roughness={0.32}
        />
      </mesh>
      <group ref={left} name={`${station.id}-left-pedal`}>
        <Instances parts={pedal} material={fitnessRubber}>
          <BeveledBox />
        </Instances>
      </group>
      <group ref={right} name={`${station.id}-right-pedal`}>
        <Instances parts={pedal} material={fitnessRubber}>
          <BeveledBox />
        </Instances>
      </group>
      <group
        ref={lh}
        position={[
          -0.32 * AVATAR.scale,
          station.baseHeight + 1.08 * AVATAR.scale,
          0,
        ]}
        scale={AVATAR.scale}
      >
        <Instances parts={handle} material={fitnessMetal}>
          <cylinderGeometry args={[1, 1, 1, 10]} />
        </Instances>
      </group>
      <group
        ref={rh}
        position={[
          0.32 * AVATAR.scale,
          station.baseHeight + 1.08 * AVATAR.scale,
          0,
        ]}
        scale={AVATAR.scale}
      >
        <Instances parts={handle} material={fitnessMetal}>
          <cylinderGeometry args={[1, 1, 1, 10]} />
        </Instances>
      </group>
    </group>
  )
}
