import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Float32BufferAttribute, Object3D, Shape, ShapeGeometry, type InstancedMesh } from 'three'
import { courtSurfaceHeight } from './ConcreteCourt'
import { BenchSpectator } from './BenchSpectator'

type Vec3 = [number, number, number]
type Block = { at: Vec3; size: Vec3; color: string; rotation?: Vec3 }

const ground = -0.17
const blocks: Block[] = []

function box(color: string, at: Vec3, size: Vec3, rotation?: Vec3) {
  blocks.push({ at, size, color, rotation })
}

function wall(from: number, to: number, z: number, height: number, color: string) {
  const width = to - from
  const x = (from + to) / 2
  box(color, [x, ground + height / 2, z], [width, height, 0.25])
  box('#b0afa0', [x, ground + height + 0.015, z], [width + 0.08, 0.085, 0.34])
  box('#a09e8f', [x, ground + 0.09, z + 0.13], [width, 0.18, 0.022])

  // Sparse seams and repairs suggest an old block wall without a busy texture.
  for (const [offset, y, span] of [[0.08, 0.36, 0.3], [0.47, 0.65, 0.34], [0.65, 0.37, 0.29]]) {
    box('#afad9e', [from + width * (offset + span / 2), ground + y, z + 0.127], [width * span, 0.013, 0.01])
    box('#afad9e', [from + width * (offset + span * 0.65), ground + y + 0.1, z + 0.127], [0.013, 0.2, 0.01])
  }
  for (const end of [from, to]) {
    box('#aaa899', [end, ground + height / 2, z], [0.19, height + 0.08, 0.34])
  }
}

function house(x: number, z: number, width: number, height: number, plaster: string, base: string) {
  box(plaster, [x, ground + height / 2, z - 0.85], [width, height, 1.7])
  box(base, [x, ground + 0.43, z + 0.005], [width, 0.86, 0.045])
  box('#a6a597', [x, ground + height - 0.18, z + 0.03], [width, 0.095, 0.12])
  box('#858a81', [x, ground + height, z - 0.83], [width + 0.18, 0.13, 1.88])
  box('#9d9f90', [x + width * 0.16, ground + height + 0.24, z - 1.03], [width * 0.52, 0.4, 0.34])
}

function windowGrille(x: number, y: number, z: number, width: number, height: number) {
  box('#8b9085', [x, y, z], [width + 0.16, height + 0.14, 0.08])
  box('#6c7975', [x, y, z + 0.045], [width, height, 0.04])
  box('#87928c', [x, y, z + 0.068], [width - 0.08, height - 0.09, 0.018])
  for (const offset of [-0.32, 0, 0.32]) {
    box('#6f7870', [x + width * offset, y, z + 0.095], [0.024, height, 0.026])
  }
  box('#7a8074', [x, y - 0.06, z + 0.095], [width, 0.027, 0.026])
  box('#b5b0a0', [x, y - height / 2 - 0.04, z + 0.08], [width + 0.24, 0.055, 0.19])
}

function distantHouse(x: number, z: number, width: number, height: number, facade: string, trim: string) {
  const roof = ground + height
  box(facade, [x, ground + height / 2, z - 0.95], [width, height, 1.9])
  box(trim, [x, roof - 0.03, z - 0.92], [width + 0.12, 0.13, 2])
  box(facade, [x - width * 0.12, roof + 0.17, z - 1.21], [width * 0.7, 0.33, 0.14])
  for (const offset of [-0.25, 0.22]) {
    const windowX = x + offset * width
    box(trim, [windowX, roof - 0.65, z + 0.028], [0.54, 0.45, 0.06])
    box(facade, [windowX, roof - 0.65, z + 0.06], [0.035, 0.45, 0.016])
  }
}

function plantPot(x: number, z: number, size: number, base = ground) {
  box('#9a8070', [x, base + size / 2, z], [size, size, size])
  box('#aa8c78', [x, base + size, z], [size * 1.12, size * 0.2, size * 1.12])
  box('#777264', [x, base + size * 1.11, z], [size * 0.86, 0.012, size * 0.86])
  const leaves = [
    [-0.23, 0.1, 0.62, 0.15, '#697f58'],
    [0.18, 0.18, -0.5, 0.45, '#859767'],
    [0.07, -0.14, -0.16, -0.45, '#657d57'],
    [-0.12, -0.24, 0.25, -0.65, '#798b60'],
  ] as const
  for (const [dx, dz, lean, pitch, color] of leaves) {
    box(color, [x + size * dx, base + size * 1.43, z + size * dz], [size * 0.16, size * 0.76, size * 0.13], [pitch, dx * 2, lean])
  }
}

function weedTuft(x: number, z: number, size: number, base = ground) {
  for (const [dx, lean, tint] of [[-0.35, 0.55, '#74885e'], [0, -0.15, '#889967'], [0.32, -0.62, '#6d8258']] as const) {
    box(tint, [x + dx * size, base + size * 0.42, z + dx * size * 0.25], [0.018, size, 0.025], [0.16, dx, lean])
  }
}

// The utility line stands in front of the alley; the opening and taller
// facades sit off-center so the perched birds have a mostly clear backdrop.
wall(-12.2, -1.62, -4.98, 1.03, '#bebbaa')
wall(0.16, 7.1, -4.98, 1.08, '#bbb9aa')
box('#9c8e80', [-5.61, ground + 0.28, -4.838], [4.2, 0.56, 0.027])
const brickColors = ['#a48877', '#a98e7e', '#9b7f70', '#a28878'] as const
for (let row = 0; row < 4; row++) {
  const stagger = row % 2 === 1
  let left = -7.71
  for (let column = 0; column < (stagger ? 11 : 10); column++) {
    const width = stagger && (column === 0 || column === 10) ? 0.21 : 0.42
    box(brickColors[(column * 3 + row) % brickColors.length]!, [left + width / 2, ground + 0.079 + row * 0.137, -4.82], [width - 0.016, 0.117, 0.018])
    left += width
  }
}
box('#a49c8b', [-5.61, ground + 0.579, -4.84], [4.22, 0.047, 0.12])
box('#a5a697', [-0.74, ground + 0.008, -7.9], [1.64, 0.015, 6.1])
box('#aaa392', [-0.77, 0.41, -10.95], [3.95, 1.16, 0.7])
box('#bdb8a9', [-0.77, 1.015, -10.95], [4.03, 0.08, 0.79])
box('#8e9587', [-0.3, 0.45, -10.58], [0.65, 1.17, 0.045])

house(-8.88, -5.86, 5.9, 3.03, '#c3b9a9', '#a39284')
house(-13.25, -7.02, 4.1, 3.78, '#b7b8aa', '#a6a496')
house(3.31, -6.42, 3.96, 2.84, '#bfc0ad', '#a39486')
house(6.7, -7.65, 3.4, 3.55, '#bbb4a5', '#a29486')

// The next street steps back twice, with quieter detail as the houses recede.
distantHouse(-5.22, -11.8, 3.65, 2.12, '#b5aea0', '#929c97')
distantHouse(-0.53, -13.1, 2.55, 2.62, '#b9b3a3', '#919b94')
distantHouse(-6.85, -17.2, 3.85, 3.18, '#aebbc0', '#99aaaf')
distantHouse(-2.99, -18.6, 2.75, 2.76, '#a6b7b6', '#91a4a8')
box('#9caba9', [-7.55, 3.22, -18.42], [0.72, 0.42, 0.55])

windowGrille(-7.55, 1.98, -5.805, 0.94, 0.69)
windowGrille(-10.24, 1.98, -5.805, 1.03, 0.69)
windowGrille(2.8, 1.91, -6.365, 0.89, 0.62)
windowGrille(6.68, 2.16, -7.595, 1.03, 0.77)

// Old outdoor unit, conduit and service meter are grouped on one side.
box('#adae9f', [1.92, 1.38, -6.31], [0.48, 0.28, 0.22])
box('#888e82', [1.92, 1.38, -6.191], [0.33, 0.17, 0.022])
for (let i = 0; i < 4; i++) {
  box('#a4a99b', [1.92, 1.317 + i * 0.042, -6.175], [0.34, 0.012, 0.015])
}
box('#919386', [1.53, 1.04, -6.37], [0.043, 1.61, 0.06])
box('#919386', [1.71, 1.46, -6.36], [0.39, 0.043, 0.06])
box('#a9aa99', [1.53, 0.93, -6.33], [0.21, 0.26, 0.11])
box('#858e82', [1.53, 0.975, -6.269], [0.12, 0.063, 0.018])

// Recessed side gate and worn blue address plate.
box('#879489', [-6.72, 0.72, -5.824], [0.77, 1.78, 0.08])
box('#a6aa99', [-6.72, 1.46, -5.78], [0.82, 0.08, 0.13])
box('#8c8b7d', [-6.09, 1.28, -5.79], [0.063, 2.68, 0.072])
box('#748b89', [-7.19, 1.33, -5.82], [0.26, 0.16, 0.045])
box('#bfc6b4', [-7.19, 1.33, -5.793], [0.13, 0.025, 0.012])

box('#bab7a7', [-5.85, ground + 0.035, -4.01], [6.85, 0.07, 1.16])
box('#b7b5a5', [2.88, ground + 0.035, -4.11], [5.12, 0.07, 0.95])
box('#a7a698', [-5.85, ground + 0.023, -3.44], [6.85, 0.046, 0.065])
box('#a7a698', [2.88, ground + 0.023, -3.66], [5.12, 0.046, 0.065])

// A short weathered bench and a few plants sit outside the court footprint.
const benchX = -4.43
const benchZ = -3.76
const benchPlankY = 0.19
const benchPlankHeight = 0.075
for (const offset of [-0.45, 0.45]) {
  box('#999b90', [benchX + offset, 0.035, benchZ], [0.13, 0.27, 0.32])
}
for (const offset of [-0.13, 0, 0.13]) {
  box('#a3927b', [benchX, benchPlankY, benchZ + offset], [1.35, benchPlankHeight, 0.112])
}
plantPot(-3.66, -4.2, 0.28, -0.10)
plantPot(-4.97, -4.29, 0.23, -0.10)
plantPot(2.49, -4.21, 0.33, -0.10)
plantPot(2.86, -4.37, 0.23, -0.10)
plantPot(0.48, -4.62, 0.21)
for (const [x, z, size, base] of [
  [-2.48, -3.61, 0.12, -0.10],
  [-2.02, -4.72, 0.19, ground], [-1.79, -4.68, 0.12, ground], [0.83, -3.8, 0.1, -0.10],
  [1.43, -4.73, 0.15, ground],
]) {
  weedTuft(x, z, size, base)
}
for (const [x, z, size] of [
  [-4.79, -3.25, 0.14], [-4.08, -3.4, 0.1], [3.55, -3.2, 0.17], [3.83, -3.03, 0.12],
  [-3.7, 1.48, 0.13], [-2.83, 1.38, 0.083], [3.56, -0.91, 0.095], [2.44, 1.55, 0.075], [3.05, -2.49, 0.083],
]) {
  weedTuft(x, z, size, courtSurfaceHeight(x, z))
}

const cloudPositions = [
  { at: [-14.85, 3.95, -24], size: [1.6, 1, 1] },
  { at: [-6.5, 3.15, -24.7], size: [-1.05, 0.72, 1] },
  { at: [-1.72, 4.04, -24], size: [1.4, 1.1, 1] },
] satisfies { at: Vec3; size: Vec3 }[]

function makeCloudGeometry() {
  const shape = new Shape()
  shape.moveTo(-1.5, 0.01)
  shape.bezierCurveTo(-1.46, 0.17, -1.06, 0.2, -0.79, 0.19)
  shape.bezierCurveTo(-0.68, 0.42, -0.34, 0.49, -0.06, 0.34)
  shape.bezierCurveTo(0.18, 0.57, 0.69, 0.45, 0.78, 0.26)
  shape.bezierCurveTo(1.16, 0.27, 1.57, 0.17, 1.62, 0.05)
  shape.bezierCurveTo(1.51, -0.09, 0.85, -0.08, 0.46, -0.09)
  shape.bezierCurveTo(-0.12, -0.1, -1.42, -0.12, -1.5, 0.01)
  shape.closePath()

  const geometry = new ShapeGeometry(shape, 10)
  const vertices = geometry.getAttribute('position')
  const base = new Color('#dcecf4')
  const highlight = new Color('#fffcf5')
  const tint = new Color()
  const colors: number[] = []
  for (let i = 0; i < vertices.count; i++) {
    tint.copy(base).lerp(highlight, Math.min(1, (vertices.getY(i) + 0.1) / 0.55))
    colors.push(tint.r, tint.g, tint.b)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

function AlleyClouds() {
  const geometry = useMemo(makeCloudGeometry, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <group name="park-clouds">
      {cloudPositions.map(({ at, size }) => (
        <mesh key={at[0]} position={at} scale={size} geometry={geometry}>
          <meshBasicMaterial vertexColors fog={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

export function AlleyBackdrop() {
  const mesh = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const scenery = mesh.current
    if (!scenery) return
    const transform = new Object3D()
    const tint = new Color()

    blocks.forEach(({ at, size, color, rotation }, index) => {
      transform.position.set(...at)
      transform.scale.set(...size)
      transform.rotation.set(...(rotation ?? [0, 0, 0]))
      transform.updateMatrix()
      scenery.setMatrixAt(index, transform.matrix)
      scenery.setColorAt(index, tint.set(color))
    })

    scenery.instanceMatrix.needsUpdate = true
    if (scenery.instanceColor) scenery.instanceColor.needsUpdate = true
    scenery.computeBoundingSphere()
  }, [])

  return (
    <>
      <AlleyClouds />
      <Suspense fallback={null}>
        <BenchSpectator seat={[benchX + 0.29, benchPlankY + benchPlankHeight / 2, benchZ + 0.11]} footHeight={-0.10} />
      </Suspense>
      <instancedMesh ref={mesh} name="park-neighborhood-backdrop" args={[undefined, undefined, blocks.length]}>
        <boxGeometry />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
    </>
  )
}
