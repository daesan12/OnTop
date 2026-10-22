import { OutdoorMetal } from './OutdoorMetal'
import {
  LAKE,
  BRIDGE,
  SHORE_ARCS,
  bridgeHeight,
  LAKE_ROCKS,
  groundHeight,
  type QualityPreset,
} from '../../config'
import { Water } from './WaterGarden'
import { Instances, beam, type Part } from './Instances'
import { SurfaceMaterial } from './SurfaceMaterial'
import { BeveledBox } from './BeveledBox'
import { SteppingStones } from './SteppingStones'
import { LakeFish } from './LakeFish'
import {
  BufferGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
} from 'three'
const lakeFloor = new BufferGeometry(),
  floorVertices: number[] = [],
  floorUV: number[] = []
for (let z = Math.floor(LAKE.z - LAKE.radiusZ); z < LAKE.z + LAKE.radiusZ; z++)
  for (
    let x = Math.floor(LAKE.x - LAKE.radiusX);
    x < LAKE.x + LAKE.radiusX;
    x++
  ) {
    if (
      Math.hypot(
        (x + 0.5 - LAKE.x) / LAKE.radiusX,
        (z + 0.5 - LAKE.z) / LAKE.radiusZ,
      ) > 1
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
      floorVertices.push(
        x + dx!,
        groundHeight(x + dx!, z + dz!) + 0.018,
        z + dz!,
      )
      floorUV.push((x + dx!) / 2, (z + dz!) / 2)
    }
  }
lakeFloor.setAttribute('position', new Float32BufferAttribute(floorVertices, 3))
lakeFloor.setAttribute('uv', new Float32BufferAttribute(floorUV, 2))
lakeFloor.computeVertexNormals()
const rockGeometry = new IcosahedronGeometry(1, 1)
const rockPositions = rockGeometry.getAttribute('position')
for (let i = 0; i < rockPositions.count; i++) {
  const x = rockPositions.getX(i),
    y = rockPositions.getY(i),
    z = rockPositions.getZ(i)
  const noise = 1 + Math.sin(x * 8 + z * 5) * Math.cos(y * 7 - z * 3) * 0.1
  rockPositions.setXYZ(i, x * noise, y * noise, z * noise)
}
rockGeometry.computeVertexNormals()
const rocks: Part[] = LAKE_ROCKS.map((r, i) => ({
  p: [...r.position],
  s: [...r.size],
  r: [0.1 * Math.sin(i), r.yaw, 0.12 * Math.cos(i)],
  c: ['#989c8f', '#b3b4a5', '#828e87'][i % 3]!,
}))
const planks: Part[] = [],
  rails: Part[] = [],
  stone: Part[] = [],
  caps: Part[] = [],
  supports: Part[] = []
for (let i = 0; i < BRIDGE.segments; i++) {
  const x =
    BRIDGE.startX +
    ((i + 0.5) * (BRIDGE.endX - BRIDGE.startX)) / BRIDGE.segments
  planks.push({
    p: [x, bridgeHeight(x) - 0.08, BRIDGE.z],
    s: [0.49, 0.16, 4],
    c: i % 3 ? '#9f8054' : '#ae8e60',
  })
}
// The crossing stays straight in plan; its gentle vertical arch is walkable.
for (const side of [-1, 1]) {
  const z = BRIDGE.z + side * BRIDGE.halfWidth
  for (let x = BRIDGE.startX; x <= BRIDGE.endX; x += 2) {
    const y = bridgeHeight(x)
    supports.push({ p: [x, y + 0.64, z], s: [0.18, 1.28, 0.18], c: '#685039' })
    caps.push({ p: [x, y + 1.33, z], s: [0.24, 0.11, 0.24], c: '#564d3b' })
    if ((x - BRIDGE.startX) % 4 === 0) {
      const bottom = groundHeight(x, z)
      stone.push({
        p: [x, (bottom + y - 0.12) / 2, z],
        s: [0.48, Math.max(0.2, y - 0.12 - bottom), 0.48],
        c: '#aba99c',
      })
      stone.push({ p: [x, y - 0.12, z], s: [0.58, 0.2, 0.58], c: '#c2bcaa' })
    }
  }
  for (let x = BRIDGE.startX; x < BRIDGE.endX; x += 2) {
    const end = Math.min(x + 2, BRIDGE.endX)
    rails.push(
      beam(
        [x + 0.12, bridgeHeight(x) + 0.25, z],
        [end - 0.12, bridgeHeight(end) + 1.15, z],
        0.045,
        '#a4865c',
      ),
      beam(
        [x + 0.12, bridgeHeight(x) + 1.15, z],
        [end - 0.12, bridgeHeight(end) + 0.25, z],
        0.045,
        '#a4865c',
      ),
      beam(
        [x, bridgeHeight(x) - 0.25, z],
        [end, bridgeHeight(end) - 0.25, z],
        0.15,
        '#6c4f35',
      ),
    )
    if ((x - BRIDGE.startX) % 4 === 0) {
      const low = Math.max(groundHeight(x, z) + 0.2, bridgeHeight(x) - 1.6)
      rails.push(
        beam(
          [x, low, z],
          [Math.min(x + 1.4, BRIDGE.endX), bridgeHeight(x + 1.4) - 0.24, z],
          0.1,
          '#856143',
        ),
      )
    }
  }
  for (let x = BRIDGE.startX; x < BRIDGE.endX; x += 0.5) {
    const y = bridgeHeight(x + 0.25)
    rails.push(
      beam([x + 0.25, y + 0.22, z], [x + 0.25, y + 1.19, z], 0.035, '#99794e'),
    )
    for (const h of [0.23, 1.22])
      rails.push(
        beam(
          [x, bridgeHeight(x) + h, z],
          [x + 0.5, bridgeHeight(x + 0.5) + h, z],
          h > 1 ? 0.08 : 0.05,
          '#81603d',
        ),
      )
  }
}
SHORE_ARCS.forEach((arc, index) => {
  const a = arc[0]!,
    b = arc[1]!,
    dx = b[0] - a[0],
    dz = b[2] - a[2]
  const length = Math.hypot(dx, dz)
  // Aligned stone curb modules replace overlapping square blocks along the shore.
  stone.push({
    p: [(a[0] + b[0]) / 2, 0.08, (a[2] + b[2]) / 2],
    s: [0.23, 0.16, length + 0.015],
    r: [0, Math.atan2(dx, dz), 0],
    c: '#b5b3a1',
  })
  if (index % 3 === 0) {
    supports.push({
      p: [a[0], 0.68, a[2]],
      s: [0.14, 1.36, 0.14],
      c: '#785e43',
    })
    caps.push({ p: [a[0], 1.38, a[2]], s: [0.2, 0.09, 0.2], c: '#b79a63' })
  }
  for (const y of [0.3, 1.3])
    rails.push(beam([a[0], y, a[2]], [b[0], y, b[2]], 0.045, '#97794e'))
  rails.push(
    beam(
      [(a[0] + b[0]) / 2, 0.3, (a[2] + b[2]) / 2],
      [(a[0] + b[0]) / 2, 1.3, (a[2] + b[2]) / 2],
      0.022,
      '#856a48',
    ),
  )
})
export function PlannedWater({ quality }: { quality: QualityPreset }) {
  return (
    <group name="lake-district">
      <mesh name="lake-bed" geometry={lakeFloor} dispose={null}>
        <SurfaceMaterial kind="stone" color="#6d7767" strength={0.4} />
      </mesh>
      <LakeFish quality={quality} />
      <Water
        position={[LAKE.x, LAKE.surfaceY, LAKE.z]}
        radius={[LAKE.radiusX, LAKE.radiusZ]}
      />
      <group name="lake-granite-boulders">
        <Instances
          parts={rocks}
          material={
            <SurfaceMaterial
              kind="stone"
              mapping="box"
              meters={1.2}
              strength={0.65}
            />
          }
        >
          <primitive object={rockGeometry} attach="geometry" dispose={null} />
        </Instances>
      </group>

      <group name="lake-bridge-deck" userData={{ keepOpaque: true }}>
        <Instances
          parts={planks}
          shadow={false}
          material={<SurfaceMaterial kind="wood" mapping="box" />}
        >
          <BeveledBox />
        </Instances>
      </group>
      <Instances
        parts={supports}
        shadow={false}
        material={<SurfaceMaterial kind="wood" mapping="box" />}
      >
        <BeveledBox />
      </Instances>
      <Instances
        parts={caps}
        shadow={false}
        material={<OutdoorMetal finish="iron" />}
      >
        <BeveledBox />
      </Instances>
      <Instances
        parts={rails}
        shadow={false}
        material={<SurfaceMaterial kind="wood" strength={0.2} />}
      >
        <cylinderGeometry args={[1, 1, 1, 6]} />
      </Instances>
      <Instances
        parts={stone}
        shadow={false}
        material={
          <SurfaceMaterial
            kind="stone"
            mapping="box"
            meters={0.85}
            detail={0.55}
            strength={0.25}
          />
        }
      >
        <BeveledBox />
      </Instances>
      <group name="stone-crossing">
        <SteppingStones />
      </group>
    </group>
  )
}
