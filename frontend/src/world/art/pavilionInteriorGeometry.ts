import { SIMPLE_MAP } from './mapRenderProfile'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { pavilionBenchRadius, PAVILION_TIMBER as TIMBER } from '../../config'

const MITRE = Math.tan(Math.PI / 8)
type Point = [number, number]

/** Physical UVs follow the longest grain axis before each piece is placed. */
function finish(g: BufferGeometry, tint: string, grain: 'x' | 'y' = 'x') {
  const p = g.getAttribute('position'),
    n = g.getAttribute('normal')
  const uv: number[] = [],
    colors: number[] = [],
    c = new Color(tint)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i)
    const face = Math.abs(n.getY(i)) > 0.5 ? z : y
    uv.push((grain === 'x' ? face : x) / 0.7, (grain === 'x' ? x : y) / 1.4)
    colors.push(c.r, c.g, c.b)
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return g
}
function merge(parts: BufferGeometry[]) {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g))
  const g = mergeGeometries(flat, false)!
  for (let i = 0; i < parts.length; i++) {
    parts[i]!.dispose()
    if (flat[i] !== parts[i]) flat[i]!.dispose()
  }
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}
/** Horizontal extruded polygon: its top is +Y, including bevelled seat edges. */
function plank(
  points: Point[],
  bottom: number,
  top: number,
  color: string,
  bevel = 0,
) {
  const shape = new Shape()
  shape.moveTo(points[0]![0], -points[0]![1])
  for (const [x, z] of points.slice(1)) shape.lineTo(x, -z)
  shape.closePath()
  const g = new ExtrudeGeometry(shape, {
    depth: top - bottom - bevel * 2,
    steps: 1,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  })
  g.rotateX(-Math.PI / 2)
  g.translate(0, bottom + bevel, 0)
  return finish(g, color)
}
function mitred(
  radius: number,
  back: number,
  front: number,
  bottom: number,
  top: number,
  color: string,
  bevel = 0,
) {
  // 5mm join line keeps adjacent boards distinct without exposing a corner gap.
  const a = (radius - back) * MITRE - 0.005 - bevel,
    b = (radius - front) * MITRE - 0.005 - bevel
  return plank(
    [
      [-a, back],
      [a, back],
      [b, front],
      [-b, front],
    ],
    bottom,
    top,
    color,
    bevel,
  )
}

/** A real through-cut, visible from both sides, rather than a painted emblem. */
export function createPiercedPanel(width: number) {
  const s = new Shape()
  s.moveTo(-width / 2, -0.145)
  s.lineTo(width / 2, -0.145)
  s.lineTo(width / 2, 0.145)
  s.lineTo(-width / 2, 0.145)
  s.closePath()
  const hole = new Path()
  for (let i = 0; i <= 32; i++) {
    const a = (-i / 32) * Math.PI * 2,
      r = 0.067 + 0.019 * Math.cos(4 * a)
    const x = Math.cos(a) * r * 1.65,
      y = Math.sin(a) * r
    if (i === 0) hole.moveTo(x, y)
    else hole.lineTo(x, y)
  }
  s.holes.push(hole)
  const g = new ExtrudeGeometry(s, {
    depth: 0.065,
    steps: 1,
    bevelEnabled: true,
    bevelSize: 0.003,
    bevelThickness: 0.003,
    bevelSegments: 1,
    curveSegments: 1,
  })
  g.translate(0, 0, -0.0325)
  return finish(g, '#b7926c')
}

/** One reusable bay for each pavilion size; local +Z looks toward its table. */
export function createPavilionBench(scale: number) {
  const radius = pavilionBenchRadius(scale),
    parts: BufferGeometry[] = []
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    rz = 0,
  ) => {
    const g = finish(new BoxGeometry(w, h, d), color, h > w ? 'y' : 'x')
    g.rotateZ(rz)
    g.translate(x, y, z)
    parts.push(g)
  }
  if(SIMPLE_MAP) {
    const span=(radius-TIMBER.seatHalfDepth)*MITRE*2
    box(0,TIMBER.seatHeight-.06,0,span,.12,TIMBER.seatHalfDepth*2,'#b9956e')
    box(0,.82,-TIMBER.inset,span,.45,.12,'#a37b54')
    for(const x of [-span*.35,span*.35]){
      box(x,.255,0,.16,.51,.5,'#9d7652')
      box(x,.51,-.41,.12,1.02,.16,'#9d7652')
    }
    return merge(parts)
  }
  const depth = TIMBER.seatHalfDepth * 2
  for (let row = 0; row < 3; row++) {
    const back = -depth / 2 + (row * depth) / 3 + 0.004,
      front = back + depth / 3 - 0.008
    parts.push(
      mitred(
        radius,
        back,
        front,
        0.45,
        TIMBER.seatHeight,
        ['#c4a079', '#b9956e', '#c8a57c'][row]!,
        0.005,
      ),
    )
  }
  for (const z of [-0.28, 0.29])
    parts.push(mitred(radius, z - 0.055, z + 0.055, 0.32, 0.46, '#9d7652'))
  const supportX = (radius - 0.32) * MITRE - 0.18
  for (const x of [-supportX, 0, supportX]) {
    for (const z of [-0.25, 0.24]) {
      box(x, 0.23, z, 0.14, 0.46, 0.14, '#a47b53')
      box(x, 0.045, z, 0.19, 0.09, 0.19, '#8d6b4d')
    }
    box(x, 0.17, 0, 0.12, 0.12, 0.64, '#9d7652')
    for (const sign of [-1, 1])
      box(
        x + sign * 0.13,
        0.34,
        0.24,
        0.1,
        0.29,
        0.13,
        '#ab825a',
        (sign * Math.PI) / 4,
      )
  }
  // Low framed back with an open handrail band; no armrests divide the seat.
  const railZ = -TIMBER.inset,
    span = (radius + TIMBER.inset) * MITRE * 2 - 0.3 * scale
  for (const [y, h] of [
    [0.635, 0.105],
    [1.01, 0.075],
  ] as const)
    box(0, y, railZ, span, h, 0.125, '#a37b54')
  parts.push(
    mitred(
      radius,
      railZ - 0.09,
      railZ + 0.1,
      TIMBER.railHeight - 0.12,
      TIMBER.railHeight,
      '#c09b71',
      0.006,
    ),
  )
  const count = scale > 1.4 ? 5 : 4,
    cell = span / count
  for (let i = 0; i < count; i++) {
    const panel = createPiercedPanel(cell - 0.085)
    panel.translate(-span / 2 + cell * (i + 0.5), 0.825, railZ)
    parts.push(panel)
  }
  for (let i = 0; i <= count; i++) {
    const x = -span / 2 + i * cell
    box(x, 0.835, railZ, 0.075, 0.43, 0.14, '#9c734d')
    box(x, 1.075, railZ, 0.065, 0.15, 0.09, '#aa8159')
  }
  return merge(parts)
}

/** Concentric octagonal boards leave the original stone threshold exposed. */
export function createPavilionFloor(scale: number) {
  const radius = 3.94 * Math.cos(Math.PI / 8) * scale,
    parts: BufferGeometry[] = []
  if(SIMPLE_MAP) return plank(Array.from({length:8},(_,i)=>{
    const a=Math.PI/8+i*Math.PI/4,r=radius/Math.cos(Math.PI/8)
    return [Math.cos(a)*r,Math.sin(a)*r] as Point
  }),.006,.026,'#b49675')
  const rings = Math.ceil(radius / 0.3),
    step = radius / rings
  const center: Point[] = Array.from({ length: 8 }, (_, i) => {
    const a = Math.PI / 8 + (i * Math.PI) / 4,
      r = (step - 0.005) / Math.cos(Math.PI / 8)
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
  parts.push(plank(center, 0.006, 0.026, '#a88b6b'))
  for (let side = 0; side < 8; side++)
    for (let ring = 1; ring < rings; ring++) {
      const inner = ring * step + 0.004,
        outer = (ring + 1) * step - 0.004
      const g = plank(
        [
          [-outer * MITRE + 0.004, -outer],
          [outer * MITRE - 0.004, -outer],
          [inner * MITRE - 0.004, -inner],
          [-inner * MITRE + 0.004, -inner],
        ],
        0.006,
        0.026,
        ['#b49675', '#a88b69', '#bba080', '#b09572'][(side * 7 + ring) % 4]!,
      )
      g.rotateY((side * Math.PI) / 4)
      parts.push(g)
    }
  return merge(parts)
}
