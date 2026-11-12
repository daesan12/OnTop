import { cameraWorldPosition } from '../../../../src/world/xrView'
import { SIMPLE_MAP } from '../../../../src/world/art/mapRenderProfile'
import { PavilionRailings } from '../../../../src/world/art/PavilionRailings'
import { TraditionalNotesBoard } from '../../../../src/world/art/TraditionalNotesBoard'
import { ParkFountain } from '../../../../src/world/art/ParkFountain'
import { ParkActivities } from '../../../../src/world/art/ParkActivities'
import { ObservationTelescopes } from '../../../../src/world/art/ObservationTelescopes'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, type Group } from 'three'
import {
  PARK_PAVILIONS,
  PAVILION_BASE_RADIUS,
  PARK_SIZE,
  type QualityPreset,
} from '../../../../src/config'
import { MainPavilionRefinements } from '../../../../src/world/art/LandmarkRefinements'
import { Pavilion, roofPoint } from '../../../../src/world/art/Pavilion'
import { Instances, beam, type Part, type XYZ } from '../../../../src/world/art/Instances'
import { SurfaceMaterial } from '../../../../src/world/art/SurfaceMaterial'
import { ObservationTower } from './ObservationTower'

// The distant mesh retains the same swept eaves as the nearby roof, with fewer
// strips and just the eight corner ridges instead of thousands of tile ribs.
const distantRoof = new BufferGeometry(),
  distantVertices: number[] = [],
  distantRidges: Part[] = []
const farPoint = (side: number, u: number, t: number): XYZ => {
  const p = roofPoint(side, u, t)
  return [p[0], p[1] - 0.72, p[2] + 3]
}
for (let side = 0; side < 8; side++)
  for (let row = 0; row < 6; row++) {
    const a = farPoint(side, 0, row / 6),
      b = farPoint(side, 1, row / 6),
      c = farPoint(side, 0, (row + 1) / 6),
      d = farPoint(side, 1, (row + 1) / 6)
    distantVertices.push(...a, ...b, ...c, ...b, ...d, ...c)
    distantRidges.push(beam(a, c, 0.065, '#6a716b'))
    if (row === 5) distantRidges.push(beam(c, d, 0.07, '#6a716b'))
  }
distantRoof.setAttribute(
  'position',
  new Float32BufferAttribute(distantVertices, 3),
)
distantRoof.computeVertexNormals()

export function PavilionSlot({ p }: { p: { id: string; x: number; z: number; floor: number; ground: number; scale: number } }) {
  const near = useRef<Group>(null),
    far = useRef<Group>(null)
  const localY = p.floor - 0.72 * p.scale
  useFrame(({ camera }) => {
    const close = !SIMPLE_MAP &&
      Math.hypot(
        cameraWorldPosition(camera).x - p.x,
        cameraWorldPosition(camera).z - p.z,
        cameraWorldPosition(camera).y - p.floor,
      ) < 75
    if (near.current) near.current.visible = close
    if (far.current) far.current.visible = !close
  })
  return (
    <group name={`pavilion-${p.id}`}>
      {SIMPLE_MAP&&<PavilionRailings pavilion={p}/>}
      {!SIMPLE_MAP && <group
        ref={near}
        position={[p.x, localY, p.z + 3 * p.scale]}
        scale={p.scale}
      >
        <Pavilion structureOnly main={p.id === 'P0'} assetScale={p.scale} />
      </group>}
      <group ref={far} position={[p.x, p.floor, p.z]} scale={p.scale}>
        <mesh geometry={distantRoof} dispose={null}>
          <meshStandardMaterial color="#454a48" roughness={1} side={2} />
        </mesh>
        <Instances parts={distantRidges} shadow={false}>
          <cylinderGeometry args={[1, 1, 1, 5]} />
        </Instances>
        <mesh position={[0, 3.45, 0]}>
          <cylinderGeometry args={[4.3, 4.3, 0.35, 8]} />
          <meshStandardMaterial color="#326954" />
        </mesh>
        <Instances
          parts={Array.from({ length: 8 }, (_, i) => {
            const a = Math.PI / 8 + (i * Math.PI) / 4
            return {
              p: [Math.cos(a) * 3.65, 1.85, Math.sin(a) * 3.65],
              s: [0.22, 3.7, 0.22],
              c: p.id === 'P0' ? '#9d4930' : '#a17a53',
            } as Part
          })}
          shadow={false}
        >
          <cylinderGeometry args={[1, 1, 1, 6]} />
        </Instances>
      </group>
      <mesh
        position={[p.x, (p.floor + p.ground) / 2, p.z]}
        rotation={[0, Math.PI / 8, 0]}
        receiveShadow
      >
        <cylinderGeometry
          args={[
            PAVILION_BASE_RADIUS * p.scale,
            PAVILION_BASE_RADIUS * p.scale,
            p.floor - p.ground,
            8,
          ]}
        />
        <SurfaceMaterial
          kind="stone"
          mapping="box"
          meters={0.85}
          color="#c8c4b4"
          detail={0.55}
          strength={0.24}
        />
      </mesh>
    </group>
  )
}
export function PlannedLandmarks({ quality }: { quality: QualityPreset }) {
  return (
    <group name={`park-landmarks-${PARK_SIZE}`}>
      <MainPavilionRefinements />
      {PARK_PAVILIONS.map((p) => (
        <PavilionSlot key={p.id} p={p} />
      ))}
      <ObservationTower><ObservationTelescopes /><TraditionalNotesBoard /></ObservationTower>
      <ParkFountain quality={quality} />
      <ParkActivities />
    </group>
  )
}
