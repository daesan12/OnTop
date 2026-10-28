import {
  BufferGeometry,
  IcosahedronGeometry,
  Float32BufferAttribute,
  Shape,
  ShapeGeometry,
} from 'three'
import { ARRIVAL_FLOWER_BEDS, LAKE, type QualityPreset } from '../../config'
import {
  beam,
  Instances,
  seeded,
  type Part,
} from './Instances'
import { DetailInstances, DetailMaterial } from './DetailInstances'
import { SurfaceMaterial } from './SurfaceMaterial'

// Original opaque meshes inspired by map_asset_3/4; no sheet pixels on billboards.
const flowerShape = new Shape()
for (let i = 0; i <= 10; i++) {
  const a = (i * Math.PI) / 5,
    r = 0.7 + 0.3 * Math.cos(a * 5)
  if (i) flowerShape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  else flowerShape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
}
const flowerGeometry = new ShapeGeometry(flowerShape, 1)
const leafShape = new Shape()
leafShape.moveTo(0, 1)
leafShape.quadraticCurveTo(0.65, 0.2, 0, -1)
leafShape.quadraticCurveTo(-0.65, 0.2, 0, 1)
const leafGeometry = new ShapeGeometry(leafShape, 3)
const lotusGeometry = (() => {
  const p: number[] = []
  for (let i = 0; i < 8; i++) {
    const a = 0.16 + (i * (Math.PI * 2 - 0.32)) / 8
    const b = 0.16 + ((i + 1) * (Math.PI * 2 - 0.32)) / 8
    p.push(
      0,
      0.09,
      0,
      Math.cos(b),
      0.025 * Math.sin(b * 7),
      Math.sin(b),
      Math.cos(a),
      0.025 * Math.sin(a * 7),
      Math.sin(a),
    )
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(p, 3))
  g.computeVertexNormals()
  return g
})()

// One shared opaque twenty-triangle crown: no alpha-tested leaf planes.
export const crownGeometry = new IcosahedronGeometry(1, 0)
export function GardenFoliageMaterial() {
  return <meshStandardMaterial flatShading roughness={1} />
}

function gardenArt() {
  // Continue the original RNG after the removed tree details (36,504 draws).
  // This preserves every flower-bed and waterside decoration transform.
  const rand = seeded(4124619156)
  const leaves: Part[] = []
  const stone: Part[] = [],
    soil: Part[] = [],
    shrubs: Part[] = [],
    flowers: Part[] = []
  const lotus: Part[] = [],
    reeds: Part[] = [],
    seedHeads: Part[] = [],
    waterFlowers: Part[] = []
  for (const bed of ARRIVAL_FLOWER_BEDS) {
    soil.push({
      p: [bed.x, 0.055, bed.z],
      s: [bed.width, 0.1, bed.depth],
      c: '#645e45',
    })
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++)
        stone.push({
          p: [
            bed.x + side * (bed.width / 2 + 0.08),
            0.13,
            bed.z - bed.depth / 2 + ((i + 0.5) * bed.depth) / 6,
          ],
          s: [0.22, 0.26, bed.depth / 6 - 0.025],
          c: i % 2 ? '#b8b6a7' : '#cbc6b5',
        })
      for (let i = 0; i < 3; i++)
        stone.push({
          p: [
            bed.x - bed.width / 2 + ((i + 0.5) * bed.width) / 3,
            0.13,
            bed.z + side * (bed.depth / 2 + 0.08),
          ],
          s: [bed.width / 3 - 0.025, 0.26, 0.22],
          c: '#c6c0af',
        })
    }
    for (let i = 0; i < 10; i++) {
      const x = bed.x + (i % 2 ? -0.43 : 0.43),
        z = bed.z - 1.75 + Math.floor(i / 2) * 0.86
      shrubs.push({
        p: [x, 0.4, z],
        s: [0.49, 0.38, 0.55],
        c: i % 3 ? '#5d7747' : '#7c8a4c',
      })
      for (let k = 0; k < 13; k++) {
        const a = rand() * 6.28,
          r = rand() * 0.42
        flowers.push({
          p: [x + Math.cos(a) * r, 0.61 + rand() * 0.2, z + Math.sin(a) * r],
          s: [0.09, 0.09, 0.09],
          r: [-1.1 + rand() * 0.6, rand(), rand() * 6],
          c: ['#e5b84d', '#f1d883', '#db8ca4', '#f4d1db', '#eee9d5'][k % 5]!,
        })
      }
    }
  }
  // Shallow coves; keep the bridge, stepping stones and swimming entrances clear.
  for (const a of [-1.05, -0.68, 0.35, 1.05, 2.05, 2.6, 3.7, 4.2]) {
    const x = LAKE.x + Math.cos(a) * (LAKE.radiusX - 1.8),
      z = LAKE.z + Math.sin(a) * (LAKE.radiusZ - 2.4)
    for (let i = 0; i < 8; i++) {
      const px = x + (rand() - 0.5) * 2.6,
        pz = z + (rand() - 0.5) * 2.4
      lotus.push({
        p: [px, LAKE.surfaceY + 0.045 + i * 0.003, pz],
        s: [0.36 + rand() * 0.25, 1, 0.35 + rand() * 0.3],
        r: [0, rand() * 6.28, 0],
        c: i % 2 ? '#547f4d' : '#779353',
      })
      if (i % 3 === 0)
        for (let petal = 0; petal < 9; petal++) {
          const angle = (petal * Math.PI * 2) / 9
          waterFlowers.push({
            p: [px + Math.sin(angle) * 0.1, 0.23, pz + Math.cos(angle) * 0.1],
            s: [0.1, 0.22, 0.1],
            r: [-0.75 * Math.cos(angle), 0, 0.75 * Math.sin(angle)],
            c: petal % 2 ? '#efb7c8' : '#f6d4d7',
          })
        }
    }
    const rx = LAKE.x + Math.cos(a) * (LAKE.radiusX - 0.65),
      rz = LAKE.z + Math.sin(a) * (LAKE.radiusZ - 0.8)
    for (let i = 0; i < 10; i++) {
      const px = rx + (rand() - 0.5) * 1.2,
        pz = rz + (rand() - 0.5) * 1.2,
        h = 0.65 + rand() * 0.6
      reeds.push(beam([px, -0.12, pz], [px + 0.08, h, pz], 0.018, '#667744'))
      seedHeads.push({
        p: [px + 0.08, h, pz],
        s: [0.045, 0.22, 0.045],
        c: '#69503a',
      })
      for (const side of [-1, 1])
        leaves.push({
          p: [px + side * 0.15, h * 0.42, pz],
          s: [0.065, h * 0.48, 0.1],
          r: [0, rand() * 3, side * 0.3],
          c: '#698449',
        })
    }
  }
  return {
    leaves,
    stone,
    soil,
    shrubs,
    flowers,
    lotus,
    reeds,
    seedHeads,
    waterFlowers,
  }
}
const art = gardenArt()
const simpleFlowers = art.flowers.filter((_, i) => i % 13 < 3)
export function ReferenceGarden({ quality }: { quality: QualityPreset }) {
  const range = quality === 'low' ? 32 : quality === 'medium' ? 50 : 65
  return (
    <group
      name="reference-garden-additions"
      userData={{ assetId: 'original/reference-garden-03-04' }}
    >
      <DetailInstances
        name="garden-blossoms"
        parts={simpleFlowers}
        range={range}
        material={<DetailMaterial range={range} side={2} />}
      >
        <primitive object={flowerGeometry} attach="geometry" dispose={null} />
      </DetailInstances>
      <DetailInstances
        name="garden-leaves"
        parts={art.leaves}
        range={range}
        material={<DetailMaterial range={range} side={2} />}
      >
        <primitive object={leafGeometry} attach="geometry" dispose={null} />
      </DetailInstances>
      <group userData={{ keepOpaque: true }}>
        <Instances
          parts={art.stone}
          shadow={false}
          material={
            <SurfaceMaterial kind="stone" mapping="box" strength={0.2} />
          }
        >
          <boxGeometry />
        </Instances>
        <Instances parts={art.soil} shadow={false}>
          <boxGeometry />
        </Instances>
      </group>
      <Instances
        parts={art.shrubs}
        shadow={false}
        material={<GardenFoliageMaterial />}
      >
        <primitive object={crownGeometry} attach="geometry" dispose={null} />
      </Instances>
      <Instances
        parts={art.lotus}
        shadow={false}
        material={<meshStandardMaterial roughness={1} side={2} />}
      >
        <primitive object={lotusGeometry} attach="geometry" dispose={null} />
      </Instances>
      <Instances parts={art.waterFlowers} shadow={false}>
        <octahedronGeometry />
      </Instances>
      <Instances parts={art.reeds} shadow={false}>
        <cylinderGeometry args={[0.5, 1, 1, 4]} />
      </Instances>
      <Instances parts={art.seedHeads} shadow={false}>
        <cylinderGeometry args={[0.7, 1, 1, 4]} />
      </Instances>
      <group
        name="arrival-stone-medallion"
        position={[0, 0.084, 54]}
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ keepOpaque: true }}
      >
        <mesh>
          <circleGeometry args={[3.35, 64]} />
          <SurfaceMaterial kind="stone" color="#cfc6ae" strength={0.15} />
        </mesh>
        {[1.15, 2.75, 3.2].map((r) => (
          <mesh key={r} position={[0, 0, 0.004]}>
            <ringGeometry args={[r, r + 0.095, 64]} />
            <meshStandardMaterial color="#777d78" roughness={1} />
          </mesh>
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <mesh
            key={i}
            geometry={leafGeometry}
            position={[
              Math.sin((i * Math.PI) / 4) * 0.52,
              Math.cos((i * Math.PI) / 4) * 0.52,
              0.008,
            ]}
            rotation={[0, 0, (-i * Math.PI) / 4]}
            scale={[0.28, 0.47, 1]}
          >
            <meshStandardMaterial color="#8b9185" roughness={1} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
