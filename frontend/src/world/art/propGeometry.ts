import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import {
  mergeGeometries,
  mergeVertices,
} from 'three/addons/utils/BufferGeometryUtils.js'
export type XYZ = [number, number, number]
export type PropFinish =
  'wood' | 'metal' | 'gold' | 'stone' | 'paint' | 'tile' | 'glow'
/** Build static, vertex-coloured material batches; dispose construction geometry immediately. */
export class PropBuilder {
  constructor(
    private readonly sphereSegments: readonly [number, number] = [12, 8],
  ) {}
  parts: Record<PropFinish, BufferGeometry[]> = {
    wood: [],
    metal: [],
    gold: [],
    stone: [],
    paint: [],
    tile: [],
    glow: [],
  }
  add(
    kind: PropFinish,
    g: BufferGeometry,
    color: string,
    p: XYZ = [0, 0, 0],
    s: XYZ = [1, 1, 1],
    r: XYZ = [0, 0, 0],
  ) {
    const flat = g.index ? g.toNonIndexed() : g.clone()
    g.dispose()
    const matrix = new Matrix4().makeRotationFromEuler(new Euler(...r))
    matrix.scale(new Vector3(...s))
    matrix.setPosition(...p)
    flat.applyMatrix4(matrix)
    const count = flat.getAttribute('position').count
    if (!flat.getAttribute('uv'))
      flat.setAttribute(
        'uv',
        new Float32BufferAttribute(new Float32Array(count * 2), 2),
      )
    const c = new Color(color),
      colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3)
    flat.setAttribute('color', new Float32BufferAttribute(colors, 3))
    this.parts[kind].push(flat)
  }
  box(k: PropFinish, c: string, p: XYZ, s: XYZ, r: XYZ = [0, 0, 0]) {
    this.add(k, new BoxGeometry(1, 1, 1), c, p, s, r)
  }
  ball(k: PropFinish, c: string, p: XYZ, s: XYZ) {
    this.add(k, new SphereGeometry(1, ...this.sphereSegments), c, p, s)
  }
  cylinder(
    k: PropFinish,
    c: string,
    p: XYZ,
    top: number,
    bottom: number,
    h: number,
    r: XYZ = [0, 0, 0],
    segments = 12,
  ) {
    this.add(
      k,
      new CylinderGeometry(top, bottom, h, segments),
      c,
      p,
      [1, 1, 1],
      r,
    )
  }
  ring(
    k: PropFinish,
    c: string,
    p: XYZ,
    radius: number,
    tube: number,
    r: XYZ = [0, 0, 0],
  ) {
    this.add(k, new TorusGeometry(radius, tube, 5, 24), c, p, [1, 1, 1], r)
  }
  curve(
    k: PropFinish,
    c: string,
    points: XYZ[],
    radius: number,
    segments = 18,
  ) {
    this.add(
      k,
      new TubeGeometry(
        new CatmullRomCurve3(points.map((p) => new Vector3(...p))),
        segments,
        radius,
        5,
        false,
      ),
      c,
    )
  }
  lathe(k: PropFinish, c: string, p: XYZ, profile: [number, number][]) {
    this.add(
      k,
      new LatheGeometry(
        profile.map((v) => new Vector2(...v)),
        24,
      ),
      c,
      p,
    )
  }
  finish() {
    return Object.fromEntries(
      Object.entries(this.parts).flatMap(([key, parts]) => {
        if (!parts.length) return []
        const flat = mergeGeometries(parts)!
        // Keep UV, normal and tint seams, but share identical vertices so the
        // GPU vertex cache can reuse work across the original triangles.
        const g = mergeVertices(flat, 1e-6)
        flat.dispose()
        parts.forEach((p) => p.dispose())
        g.computeBoundingSphere()
        return [[key, g]]
      }),
    ) as Partial<Record<PropFinish, BufferGeometry>>
  }
}
/** Four swept hip-roof faces, curved tile rolls and raised corner ridges. */
export function hipRoof(
  b: PropBuilder,
  width: number,
  depth: number,
  y: number,
  rise: number,
  red = false,
) {
  const color = red ? '#b34c2c' : '#414957',
    ridge = red ? '#d57943' : '#737c85'
  const corners: XYZ[] = [
    [-width / 2, 0, -depth / 2],
    [width / 2, 0, -depth / 2],
    [width / 2, 0, depth / 2],
    [-width / 2, 0, depth / 2],
  ]
  const point = (side: number, u: number, t: number): XYZ => {
    const a = corners[side],
      c = corners[(side + 1) % 4]
    return [
      (a[0] + (c[0] - a[0]) * u) * t,
      y +
        rise * Math.pow(1 - t, 1.5) +
        0.22 * Math.pow(t, 5) +
        0.12 * Math.pow(Math.abs(u - 0.5) * 2, 3) * t,
      (a[2] + (c[2] - a[2]) * u) * t,
    ]
  }
  for (let side = 0; side < 4; side++) {
    const positions: number[] = [],
      uv: number[] = []
    for (let j = 0; j < 10; j++)
      for (let i = 0; i < 12; i++) {
        const a = point(side, i / 12, j / 10),
          c = point(side, (i + 1) / 12, j / 10),
          d = point(side, i / 12, (j + 1) / 10),
          e = point(side, (i + 1) / 12, (j + 1) / 10)
        positions.push(...a, ...c, ...d, ...c, ...e, ...d)
        uv.push(
          i / 12,
          j / 10,
          i / 12,
          (j + 1) / 10,
          (i + 1) / 12,
          j / 10,
          (i + 1) / 12,
          j / 10,
          i / 12,
          (j + 1) / 10,
          (i + 1) / 12,
          (j + 1) / 10,
        )
      }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    g.computeVertexNormals()
    b.add('tile', g, color)
    const tiles = Math.ceil((side % 2 ? depth : width) / 0.28)
    for (let i = 0; i <= tiles; i++) {
      const pts = Array.from({ length: 9 }, (_, j) => {
        const p = point(side, i / tiles, 0.12 + j * 0.11)
        p[1] += 0.03
        return p
      })
      b.curve('tile', i % 2 ? color : ridge, pts, red ? 0.035 : 0.055, 12)
    }
    for (const t of [0.25, 0.4, 0.55, 0.7, 0.85, 1])
      b.curve(
        'tile',
        ridge,
        Array.from({ length: 9 }, (_, j) => point(side, j / 8, t)),
        0.023,
        10,
      )
    b.curve(
      'tile',
      ridge,
      Array.from({ length: 11 }, (_, j) => {
        const p = point(side, 0, j / 10)
        p[1] += 0.07
        return p
      }),
      red ? 0.085 : 0.12,
      16,
    )
  }
  b.ball('tile', ridge, [0, y + rise + 0.13, 0], [0.18, 0.17, 0.18])
}
