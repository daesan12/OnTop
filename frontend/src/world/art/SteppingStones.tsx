import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three'
import { STEPPING_STONES } from '../../config'
import { seeded, type XYZ } from './Instances'
import { SurfaceMaterial } from './SurfaceMaterial'

/** Flat walkable tops, chipped corners and dark wet sides; one static draw for the crossing. */
function createStoneGeometry() {
  const positions: number[] = [],
    colors: number[] = [],
    uvs: number[] = []
  const add = (a: XYZ, b: XYZ, c: XYZ, tint: Color) => {
    const normal = new Vector3(...b)
      .sub(new Vector3(...a))
      .cross(new Vector3(...c).sub(new Vector3(...a)))
      .normalize()
    for (const p of [a, b, c]) {
      positions.push(...p)
      colors.push(tint.r, tint.g, tint.b)
      const uv =
        Math.abs(normal.y) > 0.5
          ? [p[0], p[2]]
          : Math.abs(normal.x) > Math.abs(normal.z)
            ? [p[2], p[1]]
            : [p[0], p[1]]
      uvs.push(uv[0]! * 1.5, uv[1]! * 1.5)
    }
  }
  STEPPING_STONES.forEach((stone, index) => {
    const random = seeded(3217 + index * 97)
    const w = stone.width / 2,
      d = stone.depth / 2
    const cut = Array.from({ length: 4 }, () => 0.09 + random() * 0.1)
    // Mid-edge dents keep the individual blocks recognisable without tilting the tread.
    const outline = [
      [-w + cut[0]!, -d],
      [0, -d + random() * 0.035],
      [w - cut[1]!, -d],
      [w, -d + cut[1]!],
      [w - random() * 0.03, 0],
      [w, d - cut[2]!],
      [w - cut[2]!, d],
      [0, d - random() * 0.035],
      [-w + cut[3]!, d],
      [-w, d - cut[3]!],
      [-w + random() * 0.035, 0],
      [-w, -d + cut[0]!],
    ]
    const ring = (height: number, inset: number) =>
      outline.map(
        ([x, z]) =>
          [
            stone.x + x! * (1 - inset / w),
            height,
            stone.z + z! * (1 - inset / d),
          ] as XYZ,
      )
    const rings = [
      ring(stone.bottom, 0.025),
      ring(0.058, 0),
      ring(stone.top - 0.055, 0),
      ring(stone.top, 0.045),
    ]
    const granite = new Color(
      ['#dedbd0', '#c6cbc5', '#d8d7cc', '#cdd0c7'][index % 4],
    )
    for (let band = 0; band < rings.length - 1; band++) {
      for (let edge = 0; edge < outline.length; edge++) {
        const next = (edge + 1) % outline.length
        const tint = granite
          .clone()
          .multiplyScalar(
            (band === 0 ? 0.52 : band === 1 ? 0.78 : 0.93) *
              (0.96 + random() * 0.08),
          )
        const a = rings[band]![edge]!,
          b = rings[band + 1]![edge]!
        const c = rings[band + 1]![next]!,
          d = rings[band]![next]!
        add(a, b, c, tint)
        add(a, c, d, tint)
      }
    }
    for (let edge = 0; edge < outline.length; edge++) {
      add(
        [stone.x, stone.top, stone.z],
        rings[3]![(edge + 1) % outline.length]!,
        rings[3]![edge]!,
        granite,
      )
    }
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}
const geometry = createStoneGeometry()
export function SteppingStones() {
  return (
    <mesh
      name="granite-stepping-stones"
      geometry={geometry}
      castShadow
      receiveShadow
      dispose={null}
    >
      <SurfaceMaterial
        kind="stone"
        vertexColors
        strength={0.65}
        detail={0.55}
      />
    </mesh>
  )
}
