import { useEffect, useMemo } from 'react'
import {
  DataTexture,
  ExtrudeGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Path,
  RepeatWrapping,
  RGBAFormat,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
} from 'three'
import { Instances, type Part } from '../../world/art/Instances'
import { SurfaceMaterial } from '../../world/art/SurfaceMaterial'
import { BeveledBox } from '../../world/art/BeveledBox'
import { MainTableChairs } from '../../world/art/PavilionSeating'

function octagon(width: number, depth: number, cut: number) {
  const x = width / 2,
    z = depth / 2
  return [
    [-x + cut, -z],
    [x - cut, -z],
    [x, -z + cut],
    [x, z - cut],
    [x - cut, z],
    [-x + cut, z],
    [-x, z - cut],
    [-x, -z + cut],
  ] as const
}
function outline(width: number, depth: number, cut: number) {
  const shape = new Shape()
  octagon(width, depth, cut).forEach(([x, y], i) =>
    i ? shape.lineTo(x, y) : shape.moveTo(x, y),
  )
  shape.closePath()
  return shape
}
function ring(
  w: number,
  d: number,
  cut: number,
  iw: number,
  id: number,
  icut: number,
) {
  const shape = outline(w, d, cut),
    hole = new Path()
  ;[...octagon(iw, id, icut)]
    .reverse()
    .forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)))
  hole.closePath()
  shape.holes.push(hole)
  return shape
}
// Module-owned static geometry is reused on remount; the outer bounds match the old table.
const rail = new ExtrudeGeometry(ring(2.08, 1.58, 0.28, 1.74, 1.24, 0.2), {
  depth: 0.12,
  bevelEnabled: true,
  bevelSegments: 1,
  steps: 1,
  bevelSize: 0.01,
  bevelThickness: 0.01,
}).rotateX(-Math.PI / 2)
const apron = new ExtrudeGeometry(outline(2.0, 1.5, 0.26), {
  depth: 0.15,
  bevelEnabled: true,
  bevelSegments: 1,
  steps: 1,
  bevelSize: 0.008,
  bevelThickness: 0.008,
}).rotateX(-Math.PI / 2)
const felt = new ShapeGeometry(outline(1.74, 1.24, 0.2)).rotateX(-Math.PI / 2)
const inlay = new ShapeGeometry(
  ring(1.65, 1.15, 0.18, 1.635, 1.135, 0.176),
).rotateX(-Math.PI / 2)
const supports: Part[] = []
for (const x of [-0.52, 0.52])
  supports.push(
    { p: [x, 0.38, 0], s: [0.2, 0.76, 0.46], c: '#9d714b' },
    { p: [x, 0.08, 0], s: [0.43, 0.16, 1.02], c: '#ad825a' },
  )
supports.push({ p: [0, 0.24, 0], s: [1.2, 0.12, 0.16], c: '#9d714b' })

/** Small deterministic woven colour map; no new network asset or per-frame work. */
function clothTexture() {
  const size = 256,
    data = new Uint8Array(size * size * 4)
  let seed = 381
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const v = ((seed >>> 24) / 255 - 0.5) * 5 + ((x + y) % 2 ? 1 : -1)
      const i = (y * size + x) * 4
      data[i] = 38 + v
      data[i + 1] = 78 + v
      data[i + 2] = 53 + v
      data[i + 3] = 255
    }
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.generateMipmaps = true
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}
export function MainPavilionTable() {
  const cloth = useMemo(clothTexture, [])
  useEffect(() => () => cloth.dispose(), [cloth])
  return (
    <group name="main-octagonal-game-table">
      <Instances
        parts={supports}
        material={
          <SurfaceMaterial
            kind="wood"
            mapping="box"
            meters={0.8}
            strength={0.16}
          />
        }
      >
        <BeveledBox />
      </Instances>
      <mesh
        name="main-table-apron"
        geometry={apron}
        position={[0, 0.77, 0]}
        dispose={null}
        castShadow
        receiveShadow
      >
        <SurfaceMaterial
          kind="wood"
          mapping="box"
          color="#9d714b"
          meters={0.8}
          strength={0.16}
        />
      </mesh>
      <mesh
        name="main-table-octagonal-rail"
        geometry={rail}
        position={[0, 0.93, 0]}
        dispose={null}
        castShadow
        receiveShadow
      >
        <SurfaceMaterial
          kind="wood"
          mapping="box"
          color="#c19770"
          meters={0.8}
          strength={0.12}
        />
      </mesh>
      <mesh
        name="main-table-green-felt"
        geometry={felt}
        position={[0, 1.064, 0]}
        dispose={null}
        receiveShadow
      >
        <meshStandardMaterial map={cloth} roughness={1} />
      </mesh>
      <mesh geometry={inlay} position={[0, 1.065, 0]} dispose={null}>
        <meshStandardMaterial
          color="#a38b48"
          metalness={0.22}
          roughness={0.72}
        />
      </mesh>
      <MainTableChairs />
    </group>
  )
}
