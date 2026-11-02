import { SIMPLE_MAP } from './mapRenderProfile'
import {
  BufferGeometry,
  Float32BufferAttribute,
  CylinderGeometry,
  SphereGeometry,
  ConeGeometry,
  BoxGeometry,
} from 'three'
import { PILLARS, PAVILION, PAVILION_STEPS, PARK_PAVILIONS } from '../../config'
import { beam, Instances, type Part, type XYZ } from './Instances'
import { SurfaceMaterial } from './SurfaceMaterial'
import { BeveledBox } from './BeveledBox'
import { mergeSurfaceParts, raycastStaticSurface } from './staticSurface'

// A replaceable octagonal roof with lifted eaves. The roof and tile ribs share this profile.
export function roofPoint(side: number, u: number, t: number): XYZ {
  const a = Math.PI / 8 + (side * Math.PI) / 4,
    b = a + Math.PI / 4
  const radius = 0.12 + t * 4.88
  return [
    ((1 - u) * Math.cos(a) + u * Math.cos(b)) * radius,
    6.35 -
      2.28 * Math.sin((t * Math.PI) / 2) +
      0.32 * t ** 9 +
      0.12 * Math.abs(u * 2 - 1) ** 4 * t,
    ((1 - u) * Math.sin(a) + u * Math.sin(b)) * radius - 3,
  ]
}
function createPavilion() {
  const boxes: Part[] = [],
    columns: Part[] = [],
    feet: Part[] = [],
    tileEnds: Part[] = [],
    tiles: Part[] = []
  const vertices: number[] = []
  for (let side = 0; side < 8; side++) {
    if (SIMPLE_MAP) {
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 14; col++) {
        const a = roofPoint(side, col / 14, row / 12),
          b = roofPoint(side, (col + 1) / 14, row / 12)
        const c = roofPoint(side, col / 14, (row + 1) / 12),
          d = roofPoint(side, (col + 1) / 14, (row + 1) / 12)
        vertices.push(...a, ...b, ...c, ...b, ...d, ...c)
      }
    }
    // Raised round tile courses; dark tiled roof remains readable even without shadows.
    // The next roof side already owns col=18's corner ridge. Avoid duplicate faces.
    for (let col = 0; col < 18; col++) {
      for (let row = 2; row < 12; row++) {
        const a = roofPoint(side, col / 18, row / 12),
          b = roofPoint(side, col / 18, (row + 1) / 12)
        a[1] += 0.025
        b[1] += 0.025
        tiles.push(
          beam(
            a,
            b,
            col === 0 ? 0.064 : 0.037,
            ['#4d5351', '#515754', '#565c57', '#454d4a'][
              (side * 7 + col * 3 + row) % 4
            ]!,
          ),
        )
      }
    }
    for (let col = 0; col < 18; col++) {
      const a = roofPoint(side, col / 18, 0.987)
      const b = roofPoint(side, col / 18, 1.004)
      a[1] += 0.022
      b[1] += 0.022
      tileEnds.push(beam(a, b, col === 0 ? 0.083 : 0.054, '#626961'))
    }
    } else {
    for (let row = 0; row < 4; row++) {
      const a = roofPoint(side, 0, row / 4), b = roofPoint(side, 1, row / 4),
        c = roofPoint(side, 0, (row + 1) / 4), d = roofPoint(side, 1, (row + 1) / 4)
      vertices.push(...a, ...b, ...c, ...b, ...d, ...c)
    }
    // Four short segments on each corner retain the lifted-eave silhouette.
    for (let row = 0; row < 4; row++) {
      const a = roofPoint(side, 0, row / 4), b = roofPoint(side, 0, (row + 1) / 4)
      a[1] += 0.025; b[1] += 0.025
      tiles.push(beam(a, b, 0.064, '#626961'))
    }
    }
    const p = PILLARS[side]!,
      n = PILLARS[(side + 1) % 8]!
    columns.push({
      p: [p[0], 1.87, p[2]],
      s: [0.205, 3.74, 0.205],
      c: '#b38c60',
    })
    feet.push({
      p: [p[0], 0.16, p[2]],
      s: [0.31, 0.32, 0.31],
      c: '#b7b2a7',
    })
    columns.push({
      p: [p[0], 3.34, p[2]],
      s: [0.26, 0.14, 0.26],
      c: '#c2a16d',
    })
    const yaw = -Math.atan2(n[2] - p[2], n[0] - p[0])
    // Solid infill closes the gap between the decorated beam and roof underside.
    boxes.push({
      p: [(p[0] + n[0]) / 2, 4.13, (p[2] + n[2]) / 2],
      s: [2.91, 0.32, 0.4],
      r: [0, yaw, 0],
      c: '#456659',
    })
    for (let j = 0; j < 9; j++) {
      const u = (j + 0.5) / 9
      const end = roofPoint(side, u, 0.98)
      end[1] -= 0.09
      boxes.push(beam([0, 4.22, -3], end, 0.045, j % 2 ? '#775839' : '#a18451'))
    }
    for (const [y, h, c] of [
      [3.38, 0.2, '#843e31'],
      [3.63, 0.3, '#365e54'],
      [3.86, 0.12, '#b59a67'],
      [4, 0.14, '#38665b'],
    ] as const) {
      boxes.push({
        p: [(p[0] + n[0]) / 2, y, (p[2] + n[2]) / 2],
        s: [2.85, h, 0.34],
        r: [0, yaw, 0],
        c,
      })
    }
    for (let j = 0; j < 9; j++) {
      const u = (j + 0.5) / 9
      boxes.push({
        p: [p[0] * (1 - u) + n[0] * u, 3.63, p[2] * (1 - u) + n[2] * u],
        s: [0.14, 0.13, 0.36],
        r: [0, yaw, Math.PI / 4],
        c: j % 2 ? '#b48c52' : '#86a997',
      })
    }
    // Stacked bracket blocks around the column capitals.
    for (let j = 0; j < 3; j++)
      boxes.push({
        p: [p[0], 3.6 + j * 0.17, p[2]],
        s: [0.5 + j * 0.2, 0.12, 0.48],
        r: [0, (-side * Math.PI) / 4, 0],
        c: j % 2 ? '#a56846' : '#426f60',
      })
  }
  return { boxes, columns, feet, tileEnds, tiles, vertices }
}
const art = createPavilion()
const mainColumns = art.columns.map((p) => ({
  ...p,
  c: p.s[1] > 1 ? '#a24d32' : '#bc985c',
}))
const mainTiles = art.tiles.map((p, i) => ({
  ...p,
  c: ['#343b3e', '#42484a', '#52595a', '#3d4547'][i % 4]!,
}))
const steps: Part[] = PAVILION_STEPS.flatMap((s) =>
  Array.from(
    { length: 6 },
    (_, i) =>
      ({
        p: [
          s.center[0] - s.half[0] + ((i + 0.5) * s.half[0]) / 3,
          s.center[1],
          s.center[2],
        ],
        s: [s.half[0] / 3 - 0.008, s.half[1] * 2, s.half[2] * 2],
        c: i % 3 === 0 ? '#c5c0b4' : '#b9b5a9',
      }) as Part,
  ),
)
const masonry: Part[] = []
for (let side = 0; side < 8; side++) {
  const a = Math.PI / 8 + (side * Math.PI) / 4,
    b = a + Math.PI / 4
  const p: XYZ = [Math.cos(a) * 4.5, 0, Math.sin(a) * 4.5 - 3]
  const n: XYZ = [Math.cos(b) * 4.5, 0, Math.sin(b) * 4.5 - 3]
  const yaw = -Math.atan2(n[2] - p[2], n[0] - p[0])
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) {
      const t = (col + 0.5) / 4
      masonry.push({
        p: [
          p[0] * (1 - t) + n[0] * t,
          0.12 + row * 0.23,
          p[2] * (1 - t) + n[2] * t,
        ],
        s: [0.85, 0.215, 0.04],
        r: [0, yaw, 0],
        c: (side + col + row) % 3 ? '#b5b0a3' : '#c7c0b0',
      })
    }
}

const roof = (() => {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(art.vertices, 3))
  g.setAttribute(
    'uv',
    new Float32BufferAttribute(
      art.vertices.flatMap((_, i) =>
        i % 3 === 0 ? [art.vertices[i]! * 1.5, art.vertices[i + 2]! * 1.5] : [],
      ),
      2,
    ),
  )
  g.computeVertexNormals()
  return g
})()
const roofAssets = [false, true].map((main) => {
  const ribs = new CylinderGeometry(1, 1, 1, 6, 1, true)
  const ends = new CylinderGeometry(1, 1, 1, 8)
  const geometry = mergeSurfaceParts([
    {
      geometry: roof,
      parts: [{ p: [0, 0, 0], s: [1, 1, 1], c: main ? '#333a3d' : '#434944' }],
      strength: 0.16,
    },
    { geometry: ribs, parts: main ? mainTiles : art.tiles, strength: 0.12 },
    { geometry: ends, parts: art.tileEnds, strength: 0.18 },
  ], [1, 1, 1], `pavilion-roof-${main}`)
  ribs.dispose()
  ends.dispose()
  return geometry
})
// The two untextured finial pieces also share one asset and one finish.
const finialSphere = new SphereGeometry(0.18, SIMPLE_MAP ? 12 : 6, SIMPLE_MAP ? 8 : 3)
const finialCone = new ConeGeometry(0.12, 0.45, 8)
const finial = mergeSurfaceParts([
  {
    geometry: finialSphere,
    parts: [{ p: [0, 6.55, -3], s: [1, 1, 1], c: '#647274' }],
    strength: 0,
  },
  {
    geometry: finialCone,
    parts: [{ p: [0, 6.83, -3], s: [1, 1, 1], c: '#697773' }],
    strength: 0,
  },
], [1, 1, 1], 'pavilion-finial')
finialSphere.dispose()
finialCone.dispose()
const ceiling = new CylinderGeometry(3.8, 3.8, 0.28, 8)
const beamBox = new BoxGeometry()
const timberAssets = new Map<number, BufferGeometry>()
function timberAsset(scale: number) {
  let geometry = timberAssets.get(scale)
  if (!geometry) {
    geometry = mergeSurfaceParts(
      [
        {
          geometry: ceiling,
          parts: [
            {
              p: [0, 4.17, -3],
              s: [1, 1, 1],
              r: [0, Math.PI / 8, 0],
              c: '#8e7150',
            },
          ],
          strength: 0.45,
        },
        {
          geometry: beamBox,
          parts: art.boxes,
          mapping: 'box',
          kind: 'wood',
          strength: 0.25,
        },
      ],
      [scale, scale, scale],
      `pavilion-timber-${scale}`,
    )
    timberAssets.set(scale, geometry)
  }
  return geometry
}

/** Called by the Node build catalog; browser components retain lazy ownership. */
export function prebuildStaticSurfaces() {
  for (const scale of new Set([1, ...PARK_PAVILIONS.map(p => p.scale)])) timberAsset(scale)
}

export function Pavilion({
  structureOnly = false,
  main = false,
  assetScale = 1,
}: {
  structureOnly?: boolean
  main?: boolean
  assetScale?: number
}) {
  return (
    <group
      name="art-pavilion"
      userData={{
        assetId: 'placeholder/pavilion',
        replacementOrigin: [0, 0, -3],
      }}
    >
      {!structureOnly && (
        <>
          <mesh
            position={[0, PAVILION.floorHeight / 2, -3]}
            rotation={[0, Math.PI / 8, 0]}
            receiveShadow
          >
            <cylinderGeometry args={[4.5, 4.5, PAVILION.floorHeight, 8]} />
            <SurfaceMaterial
              kind="stone"
              mapping="box"
              meters={1.6}
              color="#c4bfb1"
              strength={0.28}
              detail={0.6}
            />
          </mesh>
          <Instances
            parts={[...steps, ...masonry]}
            material={<SurfaceMaterial kind="stone" mapping="box" meters={1} />}
          >
            <BeveledBox />
          </Instances>
          <mesh
            position={[0, PAVILION.floorHeight + 0.005, -3]}
            rotation={[-Math.PI / 2, 0, Math.PI / 8]}
          >
            <ringGeometry args={[4.15, 4.45, 8]} />
            <SurfaceMaterial kind="stone" color="#d4ccba" />
          </mesh>
        </>
      )}
      <group position={[0, PAVILION.floorHeight, 0]}>
        <mesh
          name="pavilion-timber-asset"
          geometry={timberAsset(assetScale)}
          raycast={raycastStaticSurface}
          dispose={null}
          castShadow
          receiveShadow
        >
          <SurfaceMaterial kind="wood" baked vertexColors />
        </mesh>
        <Instances
          parts={main ? mainColumns : art.columns}
          material={<SurfaceMaterial kind="wood" strength={0.25} />}
        >
          <cylinderGeometry args={[1, 1.035, 1, SIMPLE_MAP ? 16 : 8]} />
        </Instances>
        <Instances
          parts={art.feet}
          material={
            <SurfaceMaterial
              kind="stone"
              mapping="uv"
              meters={0.85}
              detail={0.4}
              strength={0.16}
            />
          }
        >
          <cylinderGeometry args={[1, 1.08, 1, SIMPLE_MAP ? 12 : 6]} />
        </Instances>
        <mesh
          name="pavilion-roof-asset"
          geometry={roofAssets[main ? 1 : 0]}
          raycast={raycastStaticSurface}
          dispose={null}
          castShadow
          receiveShadow
        >
          <SurfaceMaterial kind="stone" baked vertexColors side={2} />
        </mesh>
        <mesh
          name="pavilion-finial-asset"
          geometry={finial}
          raycast={raycastStaticSurface}
          dispose={null}
          castShadow
        >
          <meshStandardMaterial vertexColors />
        </mesh>
      </group>
    </group>
  )
}
