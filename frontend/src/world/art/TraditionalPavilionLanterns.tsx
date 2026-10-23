import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  LatheGeometry,
  SphereGeometry,
  Vector2,
  type MeshStandardMaterial,
} from 'three'
import {
  PARK_PAVILIONS,
  PAVILION_LANTERN,
  PILLARS,
  smoothRange,
} from '../../config'
import { PropBuilder, type XYZ } from './propGeometry'
import { type Part } from './Instances'
import { DetailInstances } from './DetailInstances'
import { SurfaceMaterial } from './SurfaceMaterial'
import { hanjiGrain, metalGrain } from './ornamentTextures'
import { environmentFrame } from '../environmentState'

const b = new PropBuilder(),
  red = '#833d2c',
  trim = '#a95738',
  green = '#274c3b',
  gold = '#bb9253'
// Fixed lowest point (-0.31m) preserves the existing spectator-camera clearance.
for (let i = 0; i < 8; i++) {
  const a = ((i + 0.5) * Math.PI) / 4,
    vertex = (i * Math.PI) / 4
  const p = (x: number, y: number, z = 0.263): XYZ => [
    Math.cos(a) * x + Math.sin(a) * z,
    y,
    -Math.sin(a) * x + Math.cos(a) * z,
  ]
  b.box('glow', '#f4e2b9', p(0, 0.29), [0.216, 0.54, 0.012], [0, a, 0])
  b.box(
    'wood',
    red,
    [Math.sin(vertex) * 0.283, 0.29, Math.cos(vertex) * 0.283],
    [0.033, 0.63, 0.033],
    [0, vertex, 0],
  )
  for (const y of [0.015, 0.565]) {
    b.box('wood', trim, p(0, y, 0.273), [0.235, 0.038, 0.035], [0, a, 0])
    b.box(
      'paint',
      green,
      p(0, y + (y > 0.2 ? 0.058 : -0.058), 0.275),
      [0.23, 0.075, 0.025],
      [0, a, 0],
    )
    // Carved floral medallion on the green upper/lower frieze.
    const cy = y + (y > 0.2 ? 0.058 : -0.058)
    for (let j = 0; j < 5; j++) {
      const t = (j * Math.PI * 2) / 5
      b.add(
        'paint',
        new SphereGeometry(1, 8, 5),
        j % 2 ? '#bd7549' : '#b95c41',
        p(Math.sin(t) * 0.023, cy + Math.cos(t) * 0.023, 0.295),
        [0.014, 0.021, 0.006],
        [0, a, -t],
      )
    }
    b.ball('gold', gold, p(0, cy, 0.301), [0.009, 0.009, 0.006])
  }
  // Raised wood lattice on both ends of each hanji panel.
  for (const y of [0.08, 0.135, 0.445, 0.5])
    b.box('wood', red, p(0, y, 0.278), [0.217, 0.009, 0.012], [0, a, 0])
  for (const y of [0.108, 0.472]) {
    for (const x of [-0.077, -0.025, 0.025, 0.077])
      b.box('wood', trim, p(x, y, 0.28), [0.009, 0.065, 0.014], [0, a, 0])
    for (const x of [-0.051, 0.051])
      b.box(
        'wood',
        red,
        p(x, y + 0.025, 0.281),
        [0.045, 0.008, 0.014],
        [0, a, 0],
      )
  }
  // Curved miniature roof ribs and raised eave corners.
  b.curve(
    'wood',
    trim,
    [
      [Math.sin(vertex) * 0.045, 0.85, Math.cos(vertex) * 0.045],
      [Math.sin(vertex) * 0.19, 0.74, Math.cos(vertex) * 0.19],
      [Math.sin(vertex) * 0.34, 0.7, Math.cos(vertex) * 0.34],
      [Math.sin(vertex) * 0.4, 0.76, Math.cos(vertex) * 0.4],
    ],
    0.022,
    12,
  )
  b.ball(
    'gold',
    gold,
    [Math.sin(vertex) * 0.4, 0.761, Math.cos(vertex) * 0.4],
    [0.025, 0.012, 0.025],
  )
  const next = vertex + Math.PI / 4
  b.curve(
    'wood',
    red,
    [
      [Math.sin(vertex) * 0.4, 0.74, Math.cos(vertex) * 0.4],
      p(0, 0.68, 0.35),
      [Math.sin(next) * 0.4, 0.74, Math.cos(next) * 0.4],
    ],
    0.018,
    10,
  )
}
const roofProfile = [
  [0.03, 0.85],
  [0.09, 0.81],
  [0.18, 0.745],
  [0.28, 0.704],
  [0.35, 0.706],
  [0.4, 0.74],
]
  .reverse()
  .map((p) => new Vector2(p[0], p[1]))
b.add('paint', new LatheGeometry(roofProfile, 8), green)
b.cylinder(
  'wood',
  red,
  [0, -0.085, 0],
  0.29,
  0.29,
  0.035,
  [0, Math.PI / 8, 0],
  8,
)
b.cylinder(
  'glow',
  '#f5dda6',
  [0, -0.106, 0],
  0.253,
  0.253,
  0.006,
  [0, Math.PI / 8, 0],
  8,
)
// Lotus carving on the underside; no coplanar overlays.
for (let i = 0; i < 8; i++) {
  const a = (i * Math.PI) / 4
  b.add(
    'paint',
    new SphereGeometry(1, 8, 5),
    '#9e4933',
    [Math.sin(a) * 0.1, -0.114, Math.cos(a) * 0.1],
    [0.038, 0.007, 0.078],
    [0, a, 0],
  )
}
b.lathe(
  'gold',
  gold,
  [0, 0.84, 0],
  [
    [0.067, 0],
    [0.067, 0.025],
    [0.038, 0.04],
    [0.027, 0.07],
  ],
)
b.ring('gold', gold, [0, 0.936, 0], 0.026, 0.006)
b.ring('gold', gold, [0, -0.14, 0], 0.018, 0.004)
b.ball('paint', '#4f8064', [0, -0.175, 0], [0.018, 0.018, 0.018])
b.cylinder('paint', '#913c32', [0, -0.251, 0], 0.012, 0.026, 0.118)
for (let i = 0; i < 12; i++) {
  const a = (i * Math.PI) / 6
  b.curve(
    'paint',
    i % 2 ? '#b6533d' : '#78312a',
    [
      [Math.sin(a) * 0.012, -0.193, Math.cos(a) * 0.012],
      [Math.sin(a) * 0.023, -0.304, Math.cos(a) * 0.023],
    ],
    0.002,
    3,
  )
}
const art = b.finish()
const placements: Part[] = PARK_PAVILIONS.map((p) => ({
  p: [p.x, p.floor + PAVILION_LANTERN.heightFactor * p.scale, p.z],
  s: [1, 1, 1],
  c: '#ffffff',
}))
const ceiling = PARK_PAVILIONS.map((p) => p.floor + 4.12 * p.scale)
const main = PARK_PAVILIONS[0]
for (let i = 0; i < 8; i += 2) {
  const p = PILLARS[i]!
  placements.push({
    p: [
      main.x + p[0] * 1.12 * main.scale,
      main.floor + 2.9 * main.scale,
      main.z + (p[2] + 3) * 1.12 * main.scale,
    ],
    s: [0.9, 0.9, 0.9],
    c: '#ffffff',
  })
  ceiling.push(main.floor + 3.72 * main.scale)
}
const chainLinks: Part[] = [],
  chainCaps: Part[] = []
placements.forEach((p, i) => {
  const start = p.p[1] + 0.96 * p.s[1],
    end = ceiling[i]
  const count = Math.ceil((end - start) / 0.06),
    step = (end - start) / count
  for (let j = 0; j < count; j++)
    chainLinks.push({
      p: [p.p[0], start + (j + 0.5) * step, p.p[2]],
      s: [1, 1, 1],
      r: [0, j % 2 ? Math.PI / 2 : 0, 0],
      c: gold,
    })
  chainCaps.push({ p: [p.p[0], end, p.p[2]], s: [1, 1, 1], c: gold })
})
function PaperMaterial() {
  const ref = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    if (ref.current)
      ref.current.emissiveIntensity =
        smoothRange(0.08, 0.9, environmentFrame.night) * 1.65
  })
  return (
    <meshStandardMaterial
      ref={ref}
      vertexColors
      map={hanjiGrain}
      bumpMap={hanjiGrain}
      bumpScale={0.0015}
      roughness={0.94}
      emissive="#ffb85c"
      emissiveMap={hanjiGrain}
      emissiveIntensity={0}
    />
  )
}
export function TraditionalPavilionLanterns() {
  return (
    <group name="traditional-pavilion-lanterns" dispose={null}>
      {Object.entries(art).map(([kind, geometry]) => (
        <DetailInstances
          key={kind}
          name={`lantern-${kind}`}
          parts={placements}
          range={Infinity}
          material={
            kind === 'wood' ? (
              <SurfaceMaterial
                kind="wood"
                mapping="box"
                meters={0.35}
                detail={0.25}
                strength={0.18}
                vertexColors
              />
            ) : kind === 'glow' ? (
              <PaperMaterial />
            ) : (
              <meshStandardMaterial
                vertexColors
                roughness={kind === 'gold' ? 0.4 : 0.7}
                metalness={kind === 'gold' ? 0.7 : 0}
                roughnessMap={kind === 'gold' ? metalGrain : null}
              />
            )
          }
        >
          <primitive object={geometry} attach="geometry" />
        </DetailInstances>
      ))}
      <DetailInstances
        name="lantern-chain-links"
        parts={chainLinks}
        range={Infinity}
        material={<meshStandardMaterial metalness={0.72} roughness={0.39} />}
      >
        <torusGeometry args={[0.037, 0.006, 5, 24]} />
      </DetailInstances>
      <DetailInstances
        name="lantern-chain-caps"
        parts={chainCaps}
        range={Infinity}
        material={<meshStandardMaterial metalness={0.72} roughness={0.39} />}
      >
        <cylinderGeometry args={[0.075, 0.075, 0.022, 12]} />
      </DetailInstances>
    </group>
  )
}
