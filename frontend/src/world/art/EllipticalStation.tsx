import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { type Group } from 'three'
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
  beam([0, -0.1, 0.05], [0, -0.58, 0.05], 0.035, fitnessColors.cream),
  beam([-0.12, -0.58, 0.05], [0.12, -0.58, 0.05], 0.045, fitnessColors.frame),
]
export function EllipticalStation({ station }: { station: FitnessStation }) {
  const left = useRef<Group>(null),
    right = useRef<Group>(null),
    lh = useRef<Group>(null),
    rh = useRef<Group>(null)
  const motion = useMemo(createFitnessMotion, [])
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
          -0.44 * AVATAR.scale,
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
          0.44 * AVATAR.scale,
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
