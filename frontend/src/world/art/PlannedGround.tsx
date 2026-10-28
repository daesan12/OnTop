import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import {
  createTerrainMesh,
  groundHeight,
  createPavilionStairs,
  FOUNTAIN,
  PARK_SIZE,
  PARK_ROUTES,
  createPathStrip,
  isOnParkWalkway,
  GAME_COURT,
  GARDEN_PAGODA,
} from '../../config'
import { seeded, type Part } from './Instances'
import { SurfaceMaterial } from './SurfaceMaterial'
import { DetailInstances } from './DetailInstances'

const data = createTerrainMesh()
const terrain = new BufferGeometry()
terrain.setAttribute('position', new Float32BufferAttribute(data.vertices, 3))
terrain.setIndex(Array.from(data.indices))
terrain.setAttribute(
  'uv',
  new Float32BufferAttribute(
    Array.from({ length: data.vertices.length / 3 }, (_, i) => [
      data.vertices[i * 3]! / 3,
      data.vertices[i * 3 + 2]! / 3,
    ]).flat(),
    2,
  ),
)
// Original 96m lawn palette, surface maps and world-space texture scale.
const random = seeded(914),
  colors: number[] = [],
  tint = new Color()
for (let i = 0; i < data.vertices.length / 3; i++) {
  tint.set(
    ['#c5cea3', '#d6d9b7', '#dfe2c5', '#b4c39b'][Math.floor(random() * 4)]!,
  )
  colors.push(tint.r, tint.g, tint.b)
}
terrain.setAttribute('color', new Float32BufferAttribute(colors, 3))
terrain.computeVertexNormals()
const vertices: number[] = [],
  uv: number[] = [],
  indices: number[] = []
const curbs: Part[] = []
const inPagodaPlaza = (x: number, z: number) =>
  Math.abs(x - GARDEN_PAGODA.x) < GARDEN_PAGODA.plazaWidth / 2 + 0.25 &&
  Math.abs(z - GARDEN_PAGODA.z) < GARDEN_PAGODA.plazaWidth / 2 + 0.25
for (const [routeIndex, route] of PARK_ROUTES.entries()) {
  // The fountain now has continuous concentric paving. Keep its logical route
  // for navigation/planting, but don't overlay the older broad path strips.
  if (
    route.id === 'fountain-ring' ||
    route.points.every(
      ([x, z]) => Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < 13.8,
    )
  )
    continue
  const strip = createPathStrip(route),
    offset = vertices.length / 3
  for (let i = 0; i < strip.vertices.length; i += 3) {
    const x = strip.vertices[i]!,
      z = strip.vertices[i + 2]!
    vertices.push(x, groundHeight(x, z) + 0.075, z)
    uv.push(x, z)
  }

  indices.push(...strip.indices.map((i) => i + offset))
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]!,
      b = route.points[i]!,
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz)
    const count = Math.max(1, Math.ceil(len / 0.9))
    for (let k = 0; k < count; k++)
      for (const side of [-1, 1]) {
        const t = (k + 0.5) / count,
          x = a[0] + dx * t - (dz / len) * (route.width / 2 + 0.08) * side,
          z = a[1] + dz * t + (dx / len) * (route.width / 2 + 0.08) * side
        // Don't run edging across another path at a junction.
        if (
          inPagodaPlaza(x, z) ||
          isOnParkWalkway(
            x - (dz / len) * 0.25 * side,
            z + (dx / len) * 0.25 * side,
          )
        )
          continue
        curbs.push({
          p: [x, groundHeight(x, z) + 0.08, z],
          s: [0.15, 0.14, len / count + 0.01],
          r: [0, Math.atan2(dx, dz), 0],
          c: routeIndex % 3 ? '#aaa895' : '#c7c0ac',
        })
      }
  }
}
// Keep the paved apron attached to the monument and merge it into the path draw.
{
  const { x, z, plazaWidth } = GARDEN_PAGODA
  const half = plazaWidth / 2,
    offset = vertices.length / 3
  for (const [dx, dz] of [
    [-half, -half],
    [-half, half],
    [half, half],
    [half, -half],
  ]) {
    vertices.push(x + dx!, groundHeight(x + dx!, z + dz!) + 0.07, z + dz!)
    uv.push(x + dx!, z + dz!)
  }
  indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3)
}
// Round table courts keep the surrounding planting beds open.
for (const side of [-1, 1])
  for (const z of GAME_COURT.rows) {
    const center = vertices.length / 3,
      x = side * GAME_COURT.x
    vertices.push(x, 0.089, z)
    uv.push(x, z)
    for (let i = 0; i <= 64; i++) {
      const a = (i * Math.PI) / 32,
        dx = Math.cos(a) * 3.6,
        dz = Math.sin(a) * 3.6
      vertices.push(x + dx, 0.089, z + dz)
      uv.push(x + dx, z + dz)
      if (i) indices.push(center, center + i + 1, center + i)
    }
  }
const paths = new BufferGeometry()
paths.setAttribute('position', new Float32BufferAttribute(vertices, 3))
paths.setAttribute('uv', new Float32BufferAttribute(uv, 2))
paths.setIndex(indices)
paths.computeVertexNormals()
// Drape the entire plaza over the exact collision triangles, including its bowl.
const plaza = new BufferGeometry(),
  plazaVertices: number[] = [],
  plazaUv: number[] = []
for (
  let z = Math.floor(FOUNTAIN.z - FOUNTAIN.plazaRadius);
  z < FOUNTAIN.z + FOUNTAIN.plazaRadius;
  z++
)
  for (
    let x = Math.floor(FOUNTAIN.x - FOUNTAIN.plazaRadius);
    x < FOUNTAIN.x + FOUNTAIN.plazaRadius;
    x++
  ) {
    if (
      Math.hypot(x + 0.5 - FOUNTAIN.x, z + 0.5 - FOUNTAIN.z) >
      FOUNTAIN.plazaRadius + Math.SQRT1_2
    )
      continue
    for (const [dx, dz] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const ox = x + dx! - FOUNTAIN.x,
        oz = z + dz! - FOUNTAIN.z
      const scale = Math.min(1, FOUNTAIN.plazaRadius / Math.hypot(ox, oz))
      const px = FOUNTAIN.x + ox * scale,
        pz = FOUNTAIN.z + oz * scale
      plazaVertices.push(px, groundHeight(px, pz) + 0.035, pz)
      plazaUv.push(px / 2, pz / 2)
    }
  }
plaza.setAttribute('position', new Float32BufferAttribute(plazaVertices, 3))
plaza.setAttribute('uv', new Float32BufferAttribute(plazaUv, 2))
plaza.computeVertexNormals()
const stairData = createPavilionStairs()
const stairIndexed = new BufferGeometry()
stairIndexed.setAttribute(
  'position',
  new Float32BufferAttribute(stairData.vertices, 3),
)
stairIndexed.setIndex(Array.from(stairData.indices))
// Split normals at each riser/tread edge; the stone material uses metre-scaled box UVs.
const stairs = stairIndexed.toNonIndexed()
stairIndexed.dispose()
stairs.computeVertexNormals()
stairs.setAttribute(
  'uv',
  new Float32BufferAttribute(
    new Float32Array(stairs.getAttribute('position').count * 2),
    2,
  ),
)
export function PlannedGround() {
  return (
    <group name={`park-terrain-${PARK_SIZE}`} userData={{ keepOpaque: true }}>
      <mesh geometry={terrain} receiveShadow dispose={null}>
        <SurfaceMaterial
          kind="grass"
          color="#b4c79e"
          vertexColors
          strength={0.55}
        />
      </mesh>
      <mesh geometry={paths} receiveShadow dispose={null}>
        <SurfaceMaterial
          kind="stone"
          paving
          color="#d3cdb9"
          strength={0.25}
          depthOffset
        />
      </mesh>
      <DetailInstances
        name="path-curbs"
        range={Infinity}
        parts={curbs}
        material={<SurfaceMaterial kind="stone" mapping="box" strength={0.2} />}
      >
        <boxGeometry />
      </DetailInstances>
      <mesh
        name="pavilion-stairs-merged"
        geometry={stairs}
        dispose={null}
        receiveShadow
      >
        <SurfaceMaterial
          kind="stone"
          mapping="box"
          color="#c9c3b3"
          meters={0.85}
          detail={0.55}
          strength={0.22}
        />
      </mesh>
      <mesh geometry={plaza} dispose={null} receiveShadow>
        <SurfaceMaterial
          kind="stone"
          color="#d4cfbc"
          strength={0.2}
          depthOffset
        />
      </mesh>
    </group>
  )
}
