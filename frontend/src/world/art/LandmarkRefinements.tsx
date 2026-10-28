import { SphereGeometry } from 'three'
import {
  FOUNTAIN,
  FOUNTAIN_GARDENS,
  PARK_PAVILIONS,
  PILLARS,
} from '../../config'
import { PropBuilder } from './propGeometry'
import { PropModel } from './PropModel'
import { StaticPropLod } from './StaticPropLod'
import type { XYZ } from './Instances'

function lantern(b: PropBuilder, x: number, y: number, z: number, size = 1) {
  const p = (dy: number): XYZ => [x, y + dy * size, z]
  b.cylinder(
    'metal',
    '#343c35',
    p(0.28),
    0.045 * size,
    0.065 * size,
    0.56 * size,
  )
  b.box('metal', '#61523a', p(0.6), [0.34 * size, 0.07 * size, 0.34 * size])
  b.box('glow', '#ffda8b', p(0.82), [0.23 * size, 0.37 * size, 0.23 * size])
  for (const dx of [-1, 1])
    for (const dz of [-1, 1])
      b.box(
        'metal',
        '#343c35',
        [x + dx * 0.145 * size, y + 0.82 * size, z + dz * 0.145 * size],
        [0.035 * size, 0.43 * size, 0.035 * size],
      )
  b.cylinder(
    'metal',
    '#4a493b',
    p(1.08),
    0,
    0.27 * size,
    0.21 * size,
    [0, Math.PI / 4, 0],
    4,
  )
  b.ball('gold', '#b8a26c', p(1.22), [0.04 * size, 0.07 * size, 0.04 * size])
}
function blossom(b: PropBuilder, p: XYZ, radius: number, color: string) {
  b.ball('paint', color, p, [radius, radius * 0.4, radius])
}

const fountain = new PropBuilder([12, 8], 'fountain-refinements')
// The continuous terrain plaza supplies the entire floor; no overlay tile meshes.
for (let i = 0; i < 24; i++) {
  const a = (i * Math.PI * 2) / 24
  fountain.box(
    'stone',
    i % 4 ? '#d9cfbb' : '#bcb5a6',
    [
      FOUNTAIN.x + Math.cos(a) * 5,
      0.73 - FOUNTAIN.plazaDepth,
      FOUNTAIN.z + Math.sin(a) * 5,
    ],
    [0.49, 0.17, 0.44],
    [0, -a - Math.PI / 2, 0],
  )
}
const flowerNear = new PropBuilder([12, 8], 'fountain-flowers-near'),
  flowerFar = new PropBuilder([6, 4], 'fountain-flowers-far')
for (const [index, g] of FOUNTAIN_GARDENS.entries()) {
  const point = (dx: number, dy: number, dz: number): XYZ => [
    g.x + dx * Math.cos(g.yaw) + dz * Math.sin(g.yaw),
    g.y + dy,
    g.z - dx * Math.sin(g.yaw) + dz * Math.cos(g.yaw),
  ]
  const lp = point(-1.35, 0.3, 0)
  lantern(fountain, ...lp, 1.25)
  for (let i = 0; i < 17; i++) {
    const x = -0.9 + (i % 6) * 0.43,
      z = -0.4 + Math.floor(i / 6) * 0.34
    for (const flowers of [flowerNear, flowerFar])
      blossom(
        flowers,
        point(x, 0.78 + (i % 3) * 0.07, z),
        0.12,
        ['#df6892', '#f3d464', '#eee8ce'][(i + index) % 3]!,
      )
  }
}
const fountainArt = fountain.finish()
const fountainFlowerNear = flowerNear.finish(),
  fountainFlowerFar = flowerFar.finish()
export function FountainRefinements() {
  return (
    <group name="fountain-stone-courses-and-flowers">
      <PropModel art={fountainArt} name="fountain-stone-courses" />
      <StaticPropLod
        near={fountainFlowerNear}
        far={fountainFlowerFar}
        center={[FOUNTAIN.x, 0, FOUNTAIN.z]}
        distance={28}
        name="fountain-flowers"
      />
    </group>
  )
}

const pagoda = new PropBuilder([12, 8], 'pagoda-refinements')
for (let face = 0; face < 4; face++) {
  const a = (face * Math.PI) / 2
  for (let i = -3; i <= 3; i++) {
    const x = Math.cos(a) * i * 1.45 + Math.sin(a) * 4.4,
      z = -Math.sin(a) * i * 1.45 + Math.cos(a) * 4.4
    pagoda.ball('stone', '#d5cdb8', [x, 1.42, z], [0.15, 0.17, 0.15])
    pagoda.cylinder('stone', '#b5ad99', [x, 1.31, z], 0.14, 0.16, 0.08)
  }
}
for (const x of [-4.35, 4.35])
  for (const z of [-4.35, 4.35]) lantern(pagoda, x, 1.48, z, 0.65)
pagoda.cylinder('stone', '#c7bda5', [0, 19.85, 0], 0.08, 0.18, 0.18)
pagoda.ball('stone', '#b9b09a', [0, 19.95, 0], [0.06, 0.05, 0.06])
for (const side of [-1, 1])
  for (let i = -3; i <= 3; i++) {
    const x = side * 3.95,
      z = i * 1.06
    pagoda.ball(
      'paint',
      i % 2 ? '#527340' : '#6b824a',
      [x, 0.39, z],
      [0.23, 0.21, 0.35],
    )
    blossom(pagoda, [x, 0.58, z], 0.12, i % 2 ? '#dd6f9c' : '#e8d16e')
  }
const pagodaArt = pagoda.finish()
export function PagodaRefinements() {
  return <PropModel art={pagodaArt} name="pagoda-balustrade-finials" />
}

const main = PARK_PAVILIONS[0]
const ornament = new PropBuilder([12, 8], 'pavilion-ornaments')
for (let side = 0; side < 8; side++) {
  const p = PILLARS[side]!,
    n = PILLARS[(side + 1) % 8]!
  const a = Math.atan2((p[2] + n[2]) / 2 + 3, (p[0] + n[0]) / 2),
    yaw = Math.PI / 2 - a
  for (let j = 0; j < 5; j++) {
    const t = (j + 0.5) / 5,
      x = p[0] * (1 - t) + n[0] * t + Math.cos(a) * 0.205,
      z = p[2] * (1 - t) + n[2] * t + Math.sin(a) * 0.205
    for (let petal = 0; petal < 4; petal++) {
      const angle = (petal * Math.PI) / 2,
        dx = Math.cos(angle) * 0.075,
        dy = Math.sin(angle) * 0.075
      ornament.add(
        'paint',
        new SphereGeometry(1, 8, 6),
        petal % 2 ? '#bc6144' : '#e3c27e',
        [x + dx * Math.cos(yaw), 3.63 + dy, z - dx * Math.sin(yaw)],
        [0.055, 0.055, 0.018],
        [0, yaw, 0],
      )
    }
    ornament.ball('gold', '#d1b267', [x, 3.63, z], [0.025, 0.025, 0.025])
  }
  ornament.cylinder('gold', '#bc9b5d', [p[0], 0.28, p[2]], 0.218, 0.218, 0.055)
}
const mainArt = ornament.finish()
const base = new PropBuilder([12, 8], 'pavilion-base')
const radius = 4.5 * main.scale * Math.cos(Math.PI / 8) + 0.025
for (let side = 0; side < 8; side++) {
  if (side === 2 || side === 6) continue
  const a = (side * Math.PI) / 4,
    yaw = Math.PI / 2 - a
  const x = Math.cos(a) * radius,
    z = Math.sin(a) * radius
  for (const y of [0.18, 1.78])
    base.box('stone', '#d3c7b0', [x, y, z], [6.8, 0.13, 0.075], [0, yaw, 0])
  base.box('stone', '#ada996', [x, 1, z], [4.2, 1.1, 0.06], [0, yaw, 0])
  base.box(
    'stone',
    '#c8bea7',
    [x + Math.cos(a) * 0.04, 1, z + Math.sin(a) * 0.04],
    [3.95, 0.91, 0.04],
    [0, yaw, 0],
  )
  for (let i = -3; i <= 3; i++)
    base.box(
      'stone',
      '#e0d3b8',
      [
        x + Math.cos(yaw) * i * 0.49 + Math.cos(a) * 0.08,
        1,
        z - Math.sin(yaw) * i * 0.49 + Math.sin(a) * 0.08,
      ],
      [0.26, 0.26, 0.045],
      [0, yaw, Math.PI / 4],
    )
}
const baseArt = base.finish()
export function MainPavilionRefinements() {
  return (
    <>
      <group
        position={[main.x, main.floor, main.z + 3 * main.scale]}
        scale={main.scale}
      >
        <PropModel art={mainArt} name="main-pavilion-dancheong" />
      </group>
      <group position={[main.x, 0, main.z]}>
        <PropModel art={baseArt} name="main-pavilion-carved-stone-base" />
      </group>
    </>
  )
}
