import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { type Group } from 'three'
import {
  AVATAR,
  PULLDOWN_LIFT,
  createFitnessMotion,
  sampleFitnessMotion,
  type FitnessStation,
} from '../../config'
import { avatars, estimatedServerTime } from '../../network/worldClient'
import { Instances, beam, type Part, type XYZ } from './Instances'
import { BeveledBox } from './BeveledBox'
import {
  fitnessColors,
  fitnessMetal,
  fitnessRubber,
  FitnessPostTrim,
} from './FitnessStyle'

const green = fitnessColors.frame,
  cream = fitnessColors.cream,
  rubber = fitnessColors.rubber
const metal = fitnessMetal
const plastic = fitnessRubber
function art(s: FitnessStation) {
  const tubes: Part[] = [],
    boxes: Part[] = [],
    moving: Part[] = [],
    movingBoxes: Part[] = [],
    liftBoxes: Part[] = []
  const tube = (a: XYZ, b: XYZ, r = 0.055, c: string = cream) =>
    tubes.push(beam(a, b, r, c))
  const box = (p: XYZ, size: XYZ, c: string = rubber) =>
    boxes.push({ p, s: size, c })
  const pivot: XYZ = [0, 0, 0]
  const kind = s.kind
  if (kind === 'inversion') {
    pivot[1] = s.baseHeight + AVATAR.hipHeight * AVATAR.scale
    for (const side of [-1, 1]) {
      tube([side * 0.8, 0.1, -0.65], [side * 0.7, pivot[1], 0], 0.085, green)
      tube([side * 0.8, 0.1, 0.65], [side * 0.7, pivot[1], 0], 0.085, green)
      tube([side * 0.7, pivot[1], 0], [side * 0.36, pivot[1], 0], 0.07)
    }
    movingBoxes.push({ p: [0, 0.18, -0.16], s: [0.65, 1.65, 0.12], c: rubber })
    moving.push(beam([0, -0.9, -0.1], [0, 0.98, -0.1], 0.07, cream))
    movingBoxes.push({ p: [0, -0.54, 0.05], s: [0.7, 0.08, 0.4], c: rubber })
    for (const side of [-1, 1])
      moving.push(
        beam(
          [side * 0.25, -0.46, -0.1],
          [side * 0.25, -0.46, 0.23],
          0.07,
          green,
        ),
      )
  } else if (kind === 'surfer') {
    pivot[1] = s.baseHeight + AVATAR.hipHeight * AVATAR.scale
    for (const side of [-1, 1]) {
      tube([side * 0.95, 0.1, 0], [side * 0.95, 1.5, 0], 0.09, green)
      tube([side * 0.95, 1.1, 0], [side * 0.95, 1.1, 0.18])
      moving.push(beam([side * 0.8, 0, 0], [side * 0.8, -0.51, 0], 0.05, cream))
    }
    tube([-0.95, 1.1, 0.18], [0.95, 1.1, 0.18])
    movingBoxes.push({ p: [0, -0.51, 0], s: [1.65, 0.07, 0.65], c: rubber })
  } else if (kind === 'twister') {
    tube([0, 0.1, 0.6], [0, 1.3, 0.6], 0.11, green)
    tube([-0.65, 1.1, 0.6], [0.65, 1.1, 0.6])
    pivot[1] = 0.13
  } else if (kind === 'shoulder') {
    tube([0, 0.1, 0.78], [0, 2, 0.78], 0.12, green)
    pivot[1] = 1.02
    pivot[2] = 0.28
    for (const side of [-1, 1])
      moving.push(
        beam([0, 0, 0], [side * 0.27, 0, 0], 0.025, cream),
        beam([0, 0, 0], [0, side * 0.27, 0], 0.025, cream),
      )
    movingBoxes.push(
      { p: [0.23, 0, -0.1], s: [0.12, 0.12, 0.2], c: rubber },
      { p: [-0.23, 0, -0.1], s: [0.12, 0.12, 0.2], c: rubber },
    )
  } else if (kind === 'backmassage') {
    const z = -0.32
    for (const side of [-1, 1])
      tube([side * 0.65, 0.1, z], [side * 0.65, 1.65, z], 0.075, green)
    tube([-0.65, 1.6, z], [0.65, 1.6, z])
    pivot[1] = 1
    pivot[2] = z
  } else {
    // Seat and limb supports are fitted to the current stylized avatar proportions.
    const seatParts = kind === 'pulldown' ? liftBoxes : boxes
    seatParts.push({ p: [0, 0.54, 0], s: [0.7, 0.12, 0.65], c: rubber })
    tube([0, 0.1, 0], [0, 0.5, 0], 0.11, green)
    if (kind !== 'situp')
      seatParts.push({ p: [0, 0.88, -0.28], s: [0.65, 0.6, 0.12], c: rubber })
    if (kind === 'rower') {
      tube([0, 0.15, -0.7], [0, 0.15, 0.9], 0.09, green)
      pivot[1] = 0.65
      pivot[2] = 0.05
      moving.push(
        beam([0, -0.6, 0.15], [0, 0.35, 0], 0.065, cream),
        beam([-0.24, 0.35, 0], [0.24, 0.35, 0], 0.05, green),
      )
      movingBoxes.push({ p: [0, -0.55, 0.25], s: [1, 0.12, 0.4], c: rubber })
    } else if (kind === 'legpress') {
      pivot[1] = 0.2
      pivot[2] = 0.5
      tube([-0.65, 0.1, -0.4], [-0.65, 1, -0.4], 0.07, green)
      tube([0.65, 0.1, -0.4], [0.65, 1, -0.4], 0.07, green)
      movingBoxes.push({ p: [0, 0, 0], s: [0.8, 0.12, 0.55], c: rubber })
      moving.push(beam([0, 0, 0], [0, -0.1, -0.5], 0.07, cream))
    } else if (kind === 'pulldown') {
      tube([0, 0.1, -0.6], [0, 2.3, -0.6], 0.12, green)
      pivot[1] = 1.36
      pivot[2] = -0.4
      for (const side of [-1, 1]) {
        moving.push(beam([0, 0, 0], [side * 0.22, 0, 0.35], 0.055, cream))
        moving.push(
          beam([side * 0.22, 0, 0.35], [side * 0.22, -0.3, 0.55], 0.055, green),
        )
      }
    } else if (kind === 'situp') {
      box([0, 0.48, -0.65], [0.75, 0.14, 1.8])
      tube([0, 0.1, -1.4], [0, 0.48, -1.4], 0.085, green)
      tube([-0.5, 0.4, 0.45], [0.5, 0.4, 0.45], 0.09, green)
    }
  }
  return { tubes, boxes, moving, movingBoxes, liftBoxes, pivot }
}
export function ExerciseStation({ station }: { station: FitnessStation }) {
  const model = useMemo(() => art(station), [station]),
    motion = useMemo(createFitnessMotion, []),
    moving = useRef<Group>(null),
    seatLift = useRef<Group>(null)
  useFrame(() => {
    if (!moving.current) return
    let visitor
    for (const a of avatars.values())
      if (a.fitnessId === station.id && a.connected) {
        visitor = a
        break
      }
    sampleFitnessMotion(
      station.kind,
      visitor?.fitnessStartedAt ?? 0,
      visitor ? estimatedServerTime() : 0,
      motion,
    )
    if (seatLift.current)
      seatLift.current.position.y = motion.mechanism * PULLDOWN_LIFT
    moving.current.rotation.set(0, 0, 0)
    moving.current.position.set(...model.pivot)
    switch (station.kind) {
      case 'inversion':
        moving.current.rotation.x = motion.mechanism
        break
      case 'surfer':
        moving.current.rotation.z = motion.mechanism
        break
      case 'twister':
        moving.current.rotation.y = motion.mechanism
        break
      case 'shoulder':
        moving.current.rotation.z = motion.wheel
        break
      case 'backmassage':
        moving.current.rotation.x = motion.wheel
        break
      case 'rower':
        moving.current.rotation.x = -motion.mechanism * 0.5
        break
      case 'legpress':
        moving.current.position.z += motion.mechanism * 0.35
        break
      case 'pulldown':
        moving.current.rotation.x = motion.mechanism * 0.12
        break
    }
  })
  return (
    <group
      name={station.id}
      position={station.position}
      rotation={[0, station.yaw, 0]}
    >
      <FitnessPostTrim parts={model.tubes} />
      <Instances parts={model.tubes} material={metal}>
        <cylinderGeometry args={[1, 1, 1, 16]} />
      </Instances>
      <Instances parts={model.boxes} material={plastic}>
        <BeveledBox />
      </Instances>
      {station.kind === 'pulldown' && (
        <group ref={seatLift} name="pulldown-seat-lift">
          <Instances parts={model.liftBoxes} material={plastic}>
            <BeveledBox />
          </Instances>
        </group>
      )}
      <group
        ref={moving}
        name={`${station.id}-mechanism`}
        position={model.pivot}
      >
        <Instances parts={model.moving} material={metal}>
          <cylinderGeometry args={[1, 1, 1, 10]} />
        </Instances>
        <Instances parts={model.movingBoxes} material={plastic}>
          <BeveledBox />
        </Instances>
        {station.kind === 'twister' && (
          <group>
            <mesh>
              <cylinderGeometry args={[0.55, 0.55, 0.08, 32]} />
              <meshStandardMaterial
                color={green}
                roughness={0.38}
                metalness={0.25}
              />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.043, 0]}>
              <torusGeometry args={[0.46, 0.012, 5, 32]} />
              <meshStandardMaterial
                color={fitnessColors.brass}
                roughness={0.4}
                metalness={0.45}
              />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                position={[side * 0.19, 0.045, 0]}
                scale={[0.19, 0.012, 0.33]}
              >
                <BeveledBox />
                <meshStandardMaterial color={fitnessColors.tread} />
              </mesh>
            ))}
          </group>
        )}
        {station.kind === 'shoulder' && (
          <mesh>
            <torusGeometry args={[0.28, 0.04, 8, 40]} />
            <meshStandardMaterial
              color={green}
              metalness={0.35}
              roughness={0.5}
            />
          </mesh>
        )}
        {station.kind === 'backmassage' &&
          [-0.3, 0, 0.3].map((x, i) => (
            <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.13, 0.13, 0.28, 10]} />
              <meshStandardMaterial
                color={i % 2 ? fitnessColors.cream : fitnessColors.rubber}
              />
            </mesh>
          ))}
      </group>
      {station.kind === 'twister' && (
        <mesh position={[0, 1.1, 0.6]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.55, 0.035, 8, 32]} />
          <meshStandardMaterial
            color={green}
            roughness={0.32}
            metalness={0.38}
          />
        </mesh>
      )}
      {station.kind === 'inversion' &&
        [-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.78, 1.2, 0]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <torusGeometry args={[0.55, 0.04, 8, 32]} />
            <meshStandardMaterial color={cream} />
          </mesh>
        ))}
    </group>
  )
}
