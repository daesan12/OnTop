import { ExerciseStation } from './ExerciseStation'
import { EllipticalStation } from './EllipticalStation'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { type Group } from 'three'
import {
  AVATAR,
  FITNESS,
  FITNESS_AREA,
  FITNESS_STATIONS,
  fitnessSwing,
} from '../../config'
import { avatars, estimatedServerTime } from '../../network/worldClient'
import { beam, Instances, type Part } from './Instances'
import { BeveledBox } from './BeveledBox'
import {
  fitnessColors,
  fitnessMetal,
  fitnessRubber,
  FitnessPostTrim,
  FitnessPads,
} from './FitnessStyle'
import { SurfaceMaterial } from './SurfaceMaterial'

const dark = fitnessColors.frame,
  silver = fitnessColors.cream,
  accent = fitnessColors.brass
const frame: Part[] = [],
  bolts: Part[] = []
for (const side of [-1, 1]) {
  frame.push(beam([side * 0.96, 0.12, 0], [side * 0.96, 1.45, 0], 0.095, dark))
  frame.push(
    beam(
      [side * 0.96, FITNESS.handleHeight, 0],
      [side * 0.96, FITNESS.handleHeight, FITNESS.handleReach],
      0.045,
      silver,
    ),
  )
  frame.push(
    beam([side * 0.96, 0.2, -0.7], [side * 0.96, 0.22, 0.7], 0.09, silver),
  )
  frame.push(
    beam(
      [side * 0.96, FITNESS.pedalHeight + FITNESS.hipHeight, 0],
      [side * 0.8 * AVATAR.scale, FITNESS.pedalHeight + FITNESS.hipHeight, 0],
      0.14,
      accent,
    ),
  )
  for (const z of [-0.65, 0.65])
    bolts.push({
      p: [side * 0.96, 0.06, z],
      s: [0.38, 0.12, 0.34],
      c: fitnessColors.frame,
    })
  frame.push({ p: [side * 0.96, 1.47, 0], s: [0.11, 0.07, 0.11], c: silver })
}
frame.push(
  beam(
    [-0.96, FITNESS.handleHeight, FITNESS.handleReach],
    [0.96, FITNESS.handleHeight, FITNESS.handleReach],
    0.05,
    silver,
  ),
)
frame.push(
  beam(
    [-0.7, FITNESS.handleHeight, FITNESS.handleReach],
    [0.7, FITNESS.handleHeight, FITNESS.handleReach],
    0.055,
    dark,
  ),
)
const pedalBoxes: Part[] = [
  { p: [0, -0.635, 0.08], s: [0.46, 0.07, 0.68], c: fitnessColors.rubber },
]
for (let i = 0; i < 7; i++)
  pedalBoxes.push({
    p: [0, -0.594, -0.18 + i * 0.085],
    s: [0.39, 0.012, 0.024],
    c: fitnessColors.tread,
  })
const pedalArms = [-1, 1].map((side) => [
  beam([side * 0.7, 0, 0], [side * 0.7, -0.53, 0], 0.045, silver),
  beam([side * 0.7, -0.53, 0], [0, -0.56, 0.08], 0.045, silver),
])
const metal = fitnessMetal

function Walker({ station }: { station: (typeof FITNESS_STATIONS)[number] }) {
  const left = useRef<Group>(null),
    right = useRef<Group>(null)
  useFrame(() => {
    let startedAt = 0
    for (const visitor of avatars.values()) {
      if (visitor.fitnessId !== station.id) continue
      if (visitor.connected) startedAt = visitor.fitnessStartedAt
      break
    }
    const angle = startedAt ? fitnessSwing(startedAt, estimatedServerTime()) : 0
    if (left.current) left.current.rotation.x = angle
    if (right.current) right.current.rotation.x = -angle
  })
  return (
    <group
      name={station.id}
      position={station.position}
      rotation={[0, station.yaw, 0]}
    >
      <FitnessPostTrim parts={frame} />
      <Instances parts={frame} material={metal}>
        <cylinderGeometry args={[1, 1, 1, 12]} />
      </Instances>
      <Instances parts={bolts}>
        <BeveledBox />
      </Instances>
      {[-1, 1].map((side, i) => (
        <group
          key={side}
          ref={i === 0 ? left : right}
          name={`${station.id}-${i === 0 ? 'left' : 'right'}-pedal`}
          position={[
            side * AVATAR.legOffset * AVATAR.scale,
            FITNESS.pedalHeight + FITNESS.hipHeight,
            0,
          ]}
          scale={AVATAR.scale}
        >
          <Instances parts={pedalArms[i]!} material={metal}>
            <cylinderGeometry args={[1, 1, 1, 10]} />
          </Instances>
          <Instances parts={pedalBoxes} material={fitnessRubber}>
            <BeveledBox />
          </Instances>
        </group>
      ))}
    </group>
  )
}
export function FitnessGarden() {
  return (
    <group name="fitness-garden">
      <FitnessPads />
      <mesh position={[FITNESS_AREA.x, 0.03, FITNESS_AREA.z]} receiveShadow>
        <boxGeometry args={[FITNESS_AREA.width, 0.05, FITNESS_AREA.depth]} />
        <SurfaceMaterial
          kind="stone"
          mapping="box"
          meters={0.7}
          color="#687161"
          strength={0.15}
        />
      </mesh>

      {FITNESS_STATIONS.map((station) =>
        station.kind === 'walker' ? (
          <Walker key={station.id} station={station} />
        ) : station.kind === 'elliptical' ? (
          <EllipticalStation key={station.id} station={station} />
        ) : (
          <ExerciseStation key={station.id} station={station} />
        ),
      )}
    </group>
  )
}
