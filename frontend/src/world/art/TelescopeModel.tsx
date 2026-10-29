import {
  ExtrudeGeometry,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
} from 'three'
import { TELESCOPE } from '../../config'
import { PropBuilder } from './propGeometry'
import { metalGrain, outdoorReflectionMap } from './ornamentTextures'
import { environmentFrame } from '../environmentState'
import { useFrame } from '@react-three/fiber'

const reflection = outdoorReflectionMap

const charcoal = '#393b3b',
  brass = '#b68d50',
  edge = '#d8b578'
const metal = new MeshStandardMaterial({
  vertexColors: true,
  metalness: 0.82,
  roughness: 0.48,
  roughnessMap: metalGrain,
  bumpMap: metalGrain,
  bumpScale: 0.0008,
  envMap: reflection,
})
const gold = new MeshStandardMaterial({
  vertexColors: true,
  metalness: 0.78,
  roughness: 0.31,
  roughnessMap: metalGrain,
  envMap: reflection,
})
const rubber = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
const glass = new MeshPhysicalMaterial({
  color: '#153b57',
  metalness: 0.38,
  roughness: 0.075,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  envMap: reflection,
})

/** One controller for shared materials; no per-frame allocations or scene capture. */
export function TelescopeReflectionLighting() {
  useFrame(() => {
    const intensity = 1.15 - environmentFrame.night * 0.98
    metal.envMapIntensity =
      gold.envMapIntensity =
      glass.envMapIntensity =
        intensity
  })
  return null
}
const materials = { metal, gold, paint: rubber }
const base = new PropBuilder([12, 8], 'telescope-base'),
  yoke = new PropBuilder([12, 8], 'telescope-yoke'),
  head = new PropBuilder([12, 8], 'telescope-head')
const floor = TELESCOPE.platformHeight
// Grounded pedestal; extend only the shaft, keeping the foot and optics proportions.
base.cylinder(
  'metal',
  charcoal,
  [0, floor + 0.045, 0],
  0.34,
  0.37,
  0.09,
  [0, Math.PI / 8, 0],
  8,
)
base.cylinder(
  'gold',
  brass,
  [0, floor + 0.095, 0],
  0.335,
  0.34,
  0.012,
  [0, Math.PI / 8, 0],
  8,
)
base.lathe(
  'metal',
  charcoal,
  [0, floor, 0],
  [
    [0.28, 0.1],
    [0.28, 0.13],
    [0.23, 0.16],
    [0.21, 0.22],
    [0.18, 0.24],
    [0.15, 0.3],
    [0.145, 1.06],
    [0.18, 1.09],
    [0.18, 1.16],
    [0.12, 1.19],
  ],
)
for (const [y, r] of [
  [0.15, 0.24],
  [0.24, 0.18],
  [0.3, 0.149],
  [1.06, 0.15],
  [1.14, 0.182],
])
  base.ring('gold', brass, [0, floor + y, 0], r, 0.009, [Math.PI / 2, 0, 0])
for (let i = 0; i < 16; i++) {
  const a = (i * Math.PI) / 8
  base.cylinder(
    'metal',
    i % 2 ? '#55524a' : charcoal,
    [Math.sin(a) * 0.148, floor + 0.68, Math.cos(a) * 0.148],
    0.008,
    0.008,
    0.71,
    [0, 0, 0],
    6,
  )
}
for (let i = 0; i < 8; i++) {
  const a = ((i + 0.5) * Math.PI) / 4,
    x = Math.sin(a) * 0.295,
    z = Math.cos(a) * 0.295
  base.cylinder('metal', '#24282a', [x, floor + 0.112, z], 0.032, 0.032, 0.009)
  base.cylinder(
    'gold',
    edge,
    [x, floor + 0.129, z],
    0.022,
    0.022,
    0.03,
    [0, 0, 0],
    6,
  )
  base.box(
    'metal',
    '#534a37',
    [x, floor + 0.145, z],
    [0.025, 0.001, 0.004],
    [0, a, 0],
  )
}
yoke.cylinder('metal', charcoal, [0, 1.83, 0], 0.13, 0.13, 0.14)
yoke.ring('gold', edge, [0, 1.86, 0], 0.131, 0.009, [Math.PI / 2, 0, 0])
const outline = new Shape()
outline.moveTo(-0.435, 2.26)
outline.lineTo(-0.435, 1.99)
outline.quadraticCurveTo(-0.435, 1.86, -0.3, 1.86)
outline.lineTo(0.3, 1.86)
outline.quadraticCurveTo(0.435, 1.86, 0.435, 1.99)
outline.lineTo(0.435, 2.26)
outline.lineTo(0.36, 2.26)
outline.lineTo(0.36, 2.01)
outline.quadraticCurveTo(0.36, 1.94, 0.28, 1.94)
outline.lineTo(-0.28, 1.94)
outline.quadraticCurveTo(-0.36, 1.94, -0.36, 2.01)
outline.lineTo(-0.36, 2.26)
outline.closePath()
yoke.add(
  'metal',
  new ExtrudeGeometry(outline, {
    depth: 0.12,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 8,
  }),
  charcoal,
  [0, 0, -0.06],
)
yoke.box('gold', brass, [0, 1.918, 0.075], [0.12, 0.1, 0.012])
yoke.cylinder('metal', charcoal, [0, 1.92, 0.088], 0.036, 0.036, 0.01, [
  Math.PI / 2,
  0,
  0,
])
for (const s of [-1, 1]) {
  yoke.cylinder(
    'gold',
    brass,
    [s * 0.444, 2.22, 0],
    0.104,
    0.104,
    0.035,
    [0, 0, Math.PI / 2],
    32,
  )
  yoke.cylinder(
    'metal',
    charcoal,
    [s * 0.465, 2.22, 0],
    0.087,
    0.087,
    0.017,
    [0, 0, Math.PI / 2],
    32,
  )
  yoke.ring('gold', edge, [s * 0.475, 2.22, 0], 0.077, 0.004, [
    0,
    Math.PI / 2,
    0,
  ])
}
head.box('metal', charcoal, [0, 0, -0.04], [0.36, 0.23, 0.46])
for (const s of [-1, 1]) {
  const x = s * 0.195
  head.cylinder(
    'metal',
    charcoal,
    [x, 0, 0],
    0.184,
    0.161,
    0.62,
    [Math.PI / 2, 0, 0],
    40,
  )
  for (const z of [-0.24, 0.1, 0.29]) {
    head.ring('gold', brass, [x, 0, z], z === 0.29 ? 0.186 : 0.177, 0.011)
    head.ring(
      'metal',
      '#686052',
      [x, 0, z - 0.021],
      z === 0.29 ? 0.184 : 0.175,
      0.007,
    )
  }
  // Recessed optical glass: open rims, dark baffles, convex coated lens.
  head.cylinder(
    'paint',
    '#070f17',
    [x, 0, 0.285],
    0.162,
    0.162,
    0.009,
    [Math.PI / 2, 0, 0],
    40,
  )
  head.ring('metal', '#20292d', [x, 0, 0.314], 0.158, 0.016)
  head.ring('gold', edge, [x, 0, 0.331], 0.18, 0.007)
  head.cylinder(
    'metal',
    charcoal,
    [x, 0, -0.35],
    0.099,
    0.115,
    0.13,
    [Math.PI / 2, 0, 0],
    32,
  )
  head.cylinder(
    'paint',
    '#171e20',
    [x, 0, -0.425],
    0.094,
    0.094,
    0.055,
    [Math.PI / 2, 0, 0],
    32,
  )
  head.ring('gold', brass, [x, 0, -0.452], 0.076, 0.006)
  head.cylinder(
    'paint',
    '#050b12',
    [x, 0, -0.456],
    0.065,
    0.065,
    0.005,
    [Math.PI / 2, 0, 0],
    24,
  )
}
const art = { base: base.finish(), yoke: yoke.finish(), head: head.finish() }
const lift = TELESCOPE.eyeHeight - 2.22
for (const geometry of Object.values(art.base)) {
  const positions = geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i)
    positions.setY(
      i,
      y + Math.min(1, Math.max(0, (y - 0.3) / 0.76)) * (0.6 + lift),
    )
  }
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
}
for (const geometry of Object.values(art.yoke)) geometry.translate(0, lift, 0)
const lensGeometry = new SphereGeometry(1, 32, 16)
export function TelescopeModel({ part }: { part: keyof typeof art }) {
  return (
    <group name={`telescope-${part}`} dispose={null}>
      {Object.entries(art[part]).map(([kind, geometry]) => (
        <mesh
          key={kind}
          geometry={geometry}
          material={materials[kind as keyof typeof materials]}
          castShadow
          receiveShadow
        />
      ))}
      {part === 'head' &&
        [-1, 1].map((s) => (
          <mesh
            key={s}
            geometry={lensGeometry}
            material={glass}
            position={[s * 0.195, 0, 0.306]}
            scale={[0.145, 0.145, 0.022]}
          />
        ))}
    </group>
  )
}
