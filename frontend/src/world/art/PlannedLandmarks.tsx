import { SIMPLE_MAP } from './mapRenderProfile'
import { TraditionalNotesBoard } from './TraditionalNotesBoard'
import { ParkFountain } from './ParkFountain'
import { ParkActivities } from './ParkActivities'
import { ObservationTelescopes } from './ObservationTelescopes'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, type Group } from 'three'
import {
  PARK_PAVILIONS,
  PAVILION_BASE_RADIUS,
  OBSERVATION_TOWER as TOWER,
  createTowerRamp,
  createTowerDeck,
  TOWER_DECK_RAIL_SEGMENTS,
  towerPoint,
  PARK_SIZE,
  type QualityPreset,
} from '../../config'
import { MainPavilionRefinements } from './LandmarkRefinements'
import { Pavilion, roofPoint } from './Pavilion'
import { Instances, beam, type Part, type XYZ } from './Instances'
import { SurfaceMaterial } from './SurfaceMaterial'
import { mergeStaticBeams } from './staticBeams'

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
        camera.position.x - p.x,
        camera.position.z - p.z,
        camera.position.y - p.floor,
      ) < 75
    if (near.current) near.current.visible = close
    if (far.current) far.current.visible = !close
  })
  return (
    <group name={`pavilion-${p.id}`}>
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
const rampData = createTowerRamp(),
  ramp = new BufferGeometry()
ramp.setAttribute('position', new Float32BufferAttribute(rampData.vertices, 3))
ramp.setIndex(Array.from(rampData.indices))
ramp.setAttribute(
  'uv',
  new Float32BufferAttribute(
    Array.from({ length: rampData.vertices.length / 3 }, (_, i) => [
      i % 2,
      i / 24,
    ]).flat(),
    2,
  ),
)
ramp.computeVertexNormals()
const deckData = createTowerDeck(),
  deck = new BufferGeometry()
deck.setAttribute('position', new Float32BufferAttribute(deckData.vertices, 3))
deck.setIndex(Array.from(deckData.indices))
deck.setAttribute(
  'uv',
  new Float32BufferAttribute(
    Array.from({ length: deckData.vertices.length / 3 }, (_, i) => [
      deckData.vertices[i * 3]! / 2,
      deckData.vertices[i * 3 + 2]! / 2,
    ]).flat(),
    2,
  ),
)
deck.computeVertexNormals()
const rails: Part[] = [],
  supports: Part[] = [],
  columns: Part[] = []
for (const radius of [TOWER.inner, TOWER.outer])
  for (let i = 0; i < 360; i++) {
    if (radius === TOWER.inner && i >= 358) continue
    const a = towerPoint(i / 360, radius),
      b = towerPoint((i + 1) / 360, radius)
    for (const h of [0.5, 1.3])
      rails.push(
        beam([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.065, '#785c3a'),
      )
    if (i % 2 === 0)
      rails.push(beam([...a], [a[0], a[1] + 1.35, a[2]], 0.075, '#65492f'))
  }
for (let i = 0; i < 12; i++) {
  const a = (i * Math.PI) / 6
  columns.push(
    beam(
      [TOWER.x + Math.cos(a) * 4.8, 0, TOWER.z + Math.sin(a) * 4.8],
      [
        TOWER.x + Math.cos(a) * 4.8,
        TOWER.height - 0.08,
        TOWER.z + Math.sin(a) * 4.8,
      ],
      0.26,
      '#756044',
    ),
  )
}
// Follow the deck edge, leaving the final spiral approach open overhead.
for (const [p, q] of TOWER_DECK_RAIL_SEGMENTS) {
  const y = p[1]
  rails.push(
    beam([p[0], y + 1.3, p[2]], [q[0], y + 1.3, q[2]], 0.07, '#6e5136'),
  )
  rails.push(beam([...p], [p[0], y + 1.3, p[2]], 0.045, '#886744'))
}
// Braces and ring beams share the twelve column bearings (30°, not 45°).
for (let i = 0; i < 12; i++) {
  const a = (i * Math.PI) / 6,
    b = ((i + 1) * Math.PI) / 6
  for (let level = 0; level < 3; level++)
    supports.push(
      beam(
        [
          TOWER.x + Math.cos(a) * 4.8,
          level * 6 + 0.12,
          TOWER.z + Math.sin(a) * 4.8,
        ],
        [
          TOWER.x + Math.cos(b) * 4.8,
          (level + 1) * 6 - 0.12,
          TOWER.z + Math.sin(b) * 4.8,
        ],
        0.11,
        '#816449',
      ),
    )
  for (const y of [-0.12, 5.88, 11.88, 17.88])
    supports.push(
      beam(
        [TOWER.x + Math.cos(a) * 4.8, y, TOWER.z + Math.sin(a) * 4.8],
        [TOWER.x + Math.cos(b) * 4.8, y, TOWER.z + Math.sin(b) * 4.8],
        0.16,
        '#66513b',
      ),
    )
}
// Radial joists reach from the column line to the full width of each ramp turn.
for (let i = 1; i <= 36; i++) {
  const a = towerPoint(i / 36, 4.8),
    b = towerPoint(i / 36, TOWER.outer)
  supports.push(
    beam([a[0], a[1] - 0.24, a[2]], [b[0], b[1] - 0.24, b[2]], 0.16, '#73583c'),
  )
}
for (const radius of [TOWER.inner, TOWER.outer])
  for (let i = 0; i < TOWER.segments; i++) {
    const a = towerPoint(i / TOWER.segments, radius),
      b = towerPoint((i + 1) / TOWER.segments, radius)
    supports.push(
      beam(
        [a[0], a[1] - 0.18, a[2]],
        [b[0], b[1] - 0.18, b[2]],
        0.11,
        '#846444',
      ),
    )
  }
// Thin rail/bracing members cannot meaningfully hide the avatar. Keep their
// combined mesh opaque, so camera fading never hides the entire tower. The
// twelve solid columns still fade individually when they obstruct the player.
const towerFrame = mergeStaticBeams([
  { parts: rails, sides: SIMPLE_MAP ? 3 : 6 },
  { parts: supports, sides: SIMPLE_MAP ? 4 : 8 },
])
export function PlannedLandmarks({ quality }: { quality: QualityPreset }) {
  return (
    <group name={`park-landmarks-${PARK_SIZE}`}>
      <MainPavilionRefinements />
      {PARK_PAVILIONS.map((p) => (
        <PavilionSlot key={p.id} p={p} />
      ))}
      <ObservationTower />
      <ParkFountain quality={quality} />
      <ParkActivities />
    </group>
  )
}

/** Shared tower art; callers may translate the entire existing model for layout review. */
export function ObservationTower() {
  return (
      <group name="spiral-observation-tower">
        <mesh
          name="tower-walkway-floor"
          userData={{ keepOpaque: true }}
          geometry={ramp}
          receiveShadow
          dispose={null}
        >
          <SurfaceMaterial kind="wood" color="#bd9f6a" side={2} />
        </mesh>
        <mesh
          name="tower-frame-merged"
          userData={{ keepOpaque: true }}
          geometry={towerFrame}
          dispose={null}
          receiveShadow
        >
          <SurfaceMaterial kind="wood" strength={0.2} vertexColors />
        </mesh>
        <Instances
          parts={columns}
          shadow={false}
          material={<SurfaceMaterial kind="wood" />}
        >
          <cylinderGeometry args={[1, 1, 1, 8]} />
        </Instances>
        <mesh
          name="tower-top-floor"
          userData={{ keepOpaque: true }}
          geometry={deck}
          dispose={null}
        >
          <SurfaceMaterial kind="wood" color="#aa8955" side={2} />
        </mesh>
        <ObservationTelescopes />
        <TraditionalNotesBoard />
      </group>
  )
}
