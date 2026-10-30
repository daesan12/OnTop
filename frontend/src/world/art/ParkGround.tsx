import { useEffect, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import {
  BufferGeometry,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  TextureLoader,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  COLONNADE,
  FITNESS_AREA,
  FOUNTAIN,
  GARDEN_PAGODA,
  LAKE,
  TABLES,
  WORLD,
  PARK_PAVILIONS,
  MINI_PROPS,
  VR_ZONE,
  PAGODA_ANCHORS,
  isOnParkWalkway,
  OBSERVATION_TOWER,
} from '../../config'
import { Instances, seeded, type Part } from './Instances'
import { SurfaceMaterial, useSurfaceMaps } from './SurfaceMaterial'

// Walkway manifest also keeps decorative grass out of the paving.
const paths = [
  [
    GARDEN_PAGODA.x,
    GARDEN_PAGODA.z,
    GARDEN_PAGODA.plazaWidth,
    GARDEN_PAGODA.plazaWidth,
  ],
  [FITNESS_AREA.x, FITNESS_AREA.z, FITNESS_AREA.width, FITNESS_AREA.depth],
  [0, 0, 5.5, 88],
  [-12, -3, 62, 4.4],
  [0, 8, 88, 3.8],
  [-24, -26, 40, 3.8],
  [-32, 17, 4.4, 23],
  [-29, 28, 30, 3.2],
  [-43, 0, 3.2, 88],
  [43, 0, 3.2, 88],
  [0, -43, 88, 3.2],
  [0, 43, 88, 3.2],
]
export function isParkLawn(x: number, z: number) {
  if (Math.abs(x) > WORLD.halfSize - 2 || Math.abs(z) > WORLD.halfSize - 2)
    return false
  if (
    Math.hypot(
      (x - LAKE.x) / (LAKE.radiusX + 5.5),
      (z - LAKE.z) / (LAKE.radiusZ + 5.5),
    ) < 1
  )
    return false
  if (isOnParkWalkway(x, z, 0.5)) return false
  if (
    Math.abs(x - VR_ZONE.x) < VR_ZONE.width / 2 + 0.5 &&
    Math.abs(z - VR_ZONE.z) < VR_ZONE.depth / 2 + 0.5
  )
    return false
  if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.plazaRadius + 1)
    return false
  if (
    Math.abs(x - FITNESS_AREA.x) < FITNESS_AREA.width / 2 + 0.5 &&
    Math.abs(z - FITNESS_AREA.z) < FITNESS_AREA.depth / 2 + 0.5
  )
    return false
  if (TABLES.some((t) => Math.hypot(x - t.position[0], z - t.position[2]) < 4))
    return false
  if (PARK_PAVILIONS.some((p) => Math.hypot(x - p.x, z - p.z) < 6 * p.scale))
    return false
  if (
    MINI_PROPS.some(
      (p) =>
        Math.abs(x - p.x) < p.width / 2 + 2 &&
        Math.abs(z - p.z) < p.depth / 2 + 2,
    )
  )
    return false
  if (
    PAGODA_ANCHORS.some(
      (p) =>
        Math.abs(x - p.x) < p.plazaWidth / 2 + 1 &&
        Math.abs(z - p.z) < p.plazaWidth / 2 + 1,
    )
  )
    return false
  if (
    Math.hypot(x - OBSERVATION_TOWER.x, z - OBSERVATION_TOWER.z) <
    OBSERVATION_TOWER.outer + 1
  )
    return false
  return true
}
function pavingGeometry() {
  const parts: BufferGeometry[] = []
  const add = (g: BufferGeometry, x: number, z: number, y = 0.018) => {
    const flat = g.index ? g.toNonIndexed() : g
    if (flat !== g) g.dispose()
    flat.rotateX(-Math.PI / 2).translate(x, y, z)
    const p = flat.getAttribute('position'),
      uv = flat.getAttribute('uv')
    for (let i = 0; i < p.count; i++)
      uv.setXY(i, p.getX(i) / 3.4, p.getZ(i) / 3.4)
    parts.push(flat)
  }
  add(new RingGeometry(18, 21.5, 128), 0, -3)
  add(new CircleGeometry(6, 64), 0, -3)
  add(new CircleGeometry(FOUNTAIN.plazaRadius, 64), FOUNTAIN.x, FOUNTAIN.z)
  paths.forEach(([x, z, w, d], i) =>
    add(new PlaneGeometry(w, d), x!, z!, 0.019 + i * 0.0002),
  )
  TABLES.forEach((t) =>
    add(new CircleGeometry(3.12, 48), t.position[0], t.position[2], 0.026),
  )
  const geometry = mergeGeometries(parts)!
  parts.forEach((p) => p.dispose())
  return geometry
}
const edging: Part[] = []
function inPagodaPlaza(x: number, z: number) {
  return (
    Math.abs(x - GARDEN_PAGODA.x) < GARDEN_PAGODA.plazaWidth / 2 + 0.3 &&
    Math.abs(z - GARDEN_PAGODA.z) < GARDEN_PAGODA.plazaWidth / 2 + 0.3
  )
}
for (const radius of [18, 21.5])
  for (let i = 0; i < 192; i++) {
    const a = (i * Math.PI * 2) / 192,
      x = Math.cos(a) * radius,
      z = -3 + Math.sin(a) * radius
    if (inPagodaPlaza(x, z)) continue
    if (Math.abs(x) < 3 || Math.abs(z + 3) < 2.4 || Math.abs(z - 8) < 2.1)
      continue
    if (
      ((x - LAKE.x) / LAKE.radiusX) ** 2 + ((z - LAKE.z) / LAKE.radiusZ) ** 2 <
      1.04
    )
      continue
    edging.push({
      p: [x, 0.06, z],
      s: [0.16, 0.12, (Math.PI * radius) / 96],
      r: [0, -a, 0],
      c: i % 3 ? '#b7b4a2' : '#969b8b',
    })
  }
// Low clipped hedges divide the central lawn into four quarters like reference 1.
const hedges: Part[] = []
for (let quadrant = 0; quadrant < 4; quadrant++)
  for (let i = 0; i < 18; i++) {
    const a = (quadrant * Math.PI) / 2 + 0.3 + (i * (Math.PI / 2 - 0.6)) / 17
    if (inPagodaPlaza(Math.cos(a) * 16.4, -3 + Math.sin(a) * 16.4)) continue
    hedges.push({
      p: [Math.cos(a) * 16.4, 0.35, -3 + Math.sin(a) * 16.4],
      s: [0.64, 0.4, 0.64],
      c: i % 3 ? '#4d6939' : '#657e46',
    })
  }
export function Ground() {
  const stone = useLoader(TextureLoader, '/art/granite-paving.webp')
  const stoneDetail = useSurfaceMaps('stone')
  const paving = useMemo(pavingGeometry, [])
  const lawn = useMemo(() => {
    const geometry = new PlaneGeometry(
      WORLD.halfSize * 2,
      WORLD.halfSize * 2,
      48,
      48,
    ).rotateX(-Math.PI / 2)
    const rand = seeded(914),
      colors: number[] = [],
      color = new Color()
    for (let i = 0; i < geometry.getAttribute('position').count; i++) {
      color.set(
        ['#c5cea3', '#d6d9b7', '#dfe2c5', '#b4c39b'][Math.floor(rand() * 4)]!,
      )
      colors.push(color.r, color.g, color.b)
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    const positions = geometry.getAttribute('position'),
      uv = geometry.getAttribute('uv')
    for (let i = 0; i < positions.count; i++)
      uv.setXY(i, positions.getX(i) / 3, positions.getZ(i) / 3)
    return geometry
  }, [])
  useMemo(() => {
    stone.wrapS = stone.wrapT = RepeatWrapping
    stone.repeat.set(1, 1)
    stone.colorSpace = SRGBColorSpace
    stone.anisotropy = 4
    stone.needsUpdate = true
  }, [stone])
  useEffect(
    () => () => {
      paving.dispose()
      lawn.dispose()
    },
    [paving, lawn],
  )
  return (
    <group name="reference-park-ground">
      <mesh geometry={lawn} receiveShadow>
        <SurfaceMaterial kind="grass" vertexColors strength={0.55} />
      </mesh>
      <mesh geometry={paving} receiveShadow>
        <meshStandardMaterial
          map={stone}
          color="#e7ddc7"
          normalMap={stoneDetail.normalMap}
          normalScale={[0.14, 0.14]}
          roughnessMap={stoneDetail.roughnessMap}
          roughness={0.97}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <Instances
        parts={edging}
        shadow={false}
        material={<SurfaceMaterial kind="stone" mapping="box" />}
      >
        <boxGeometry />
      </Instances>
      <Instances
        parts={hedges}
        material={
          <SurfaceMaterial
            kind="grass"
            strength={0.75}
            color="#a8bb83"
            detail={0.28}
          />
        }
      >
        <icosahedronGeometry args={[1, 1]} />
      </Instances>
      <mesh
        position={[COLONNADE.x, 0.035, COLONNADE.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[4.6, 19]} />
        <SurfaceMaterial kind="stone" color="#c7beab" strength={0.28} />
      </mesh>
    </group>
  )
}
