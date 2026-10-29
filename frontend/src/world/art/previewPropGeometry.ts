import { SIMPLE_MAP } from './mapRenderProfile'
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
  IcosahedronGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import {
  mergeGeometries,
} from 'three/addons/utils/BufferGeometryUtils.js'
import { weldStaticVertices } from './weldStaticVertices'
import { recordPropBuild, takeBakedProp } from './bakedProps'
export type XYZ = [number, number, number]
export type PropFinish =
  'wood' | 'metal' | 'gold' | 'stone' | 'paint' | 'tile' | 'glow'
/** Build static, vertex-coloured material batches; dispose construction geometry immediately. */
export class PropBuilder {
  private readonly baked: ReturnType<typeof takeBakedProp>
  constructor(
    private readonly sphereSegments: readonly [number, number] = [12, 8],
    private readonly cacheKey?: string,
  ) { this.baked = takeBakedProp(cacheKey) }
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
    ..._legacyOptions: unknown[]
  ) {
    if (this.baked) { g.dispose(); return }
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
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    flat.setAttribute('color', new Float32BufferAttribute(colors, 3))
    this.parts[kind].push(flat)
  }
  box(k: PropFinish, c: string, p: XYZ, s: XYZ, r: XYZ = [0, 0, 0]) {
    if (this.baked) return
    if(SIMPLE_MAP && Math.max(...s) < .12) return
    this.add(k, new BoxGeometry(1, 1, 1), c, p, s, r)
  }
  ball(k: PropFinish, c: string, p: XYZ, s: XYZ) {
    if (this.baked) return
    this.add(k, SIMPLE_MAP ? new IcosahedronGeometry(1,0) : new SphereGeometry(1, ...this.sphereSegments), c, p, s)
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
    if (this.baked) return
    this.add(
      k,
      new CylinderGeometry(top, bottom, h, SIMPLE_MAP?Math.min(segments,segments>=32?32:8):segments),
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
    if (this.baked) return
    this.add(k, new TorusGeometry(radius, tube, SIMPLE_MAP?3:5, SIMPLE_MAP?8:24), c, p, [1, 1, 1], r)
  }
  curve(
    k: PropFinish,
    c: string,
    points: XYZ[],
    radius: number,
    segments = 18,
  ) {
    if (this.baked || (SIMPLE_MAP && radius < .07)) return
    this.add(
      k,
      new TubeGeometry(
        new CatmullRomCurve3(points.map((p) => new Vector3(...p))),
        SIMPLE_MAP ? Math.min(segments, 4) : segments,
        radius,
        SIMPLE_MAP ? 3 : 5,
        false,
      ),
      c,
    )
  }
  lathe(k: PropFinish, c: string, p: XYZ, profile: [number, number][]) {
    if (this.baked) return
    this.add(
      k,
      new LatheGeometry(
        (SIMPLE_MAP ? profile.filter((_,i)=>i===0||i===Math.floor(profile.length/2)||i===profile.length-1) : profile).map((v) => new Vector2(...v)),
        SIMPLE_MAP ? 8 : 24,
      ),
      c,
      p,
    )
  }
  finish() {
    if (this.baked) return this.baked
    const art = Object.fromEntries(
      Object.entries(this.parts).flatMap(([key, parts]) => {
        if (!parts.length) return []
        const flat = mergeGeometries(parts)!
        // Keep UV, normal and tint seams, but share identical vertices so the
        // GPU vertex cache can reuse work across the original triangles.
        const g = weldStaticVertices(flat, 1e-6)
        flat.dispose()
        parts.forEach((p) => p.dispose())
        g.computeBoundingSphere()
        return [[key, g]]
      }),
    ) as Partial<Record<PropFinish, BufferGeometry>>
    recordPropBuild(this.cacheKey, art)
    return art
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
    for (let j = 0; j < (SIMPLE_MAP?2:10); j++)
      for (let i = 0; i < (SIMPLE_MAP?2:12); i++) {
        const a = point(side, i / (SIMPLE_MAP?2:12), j / (SIMPLE_MAP?2:10)),
          c = point(side, (i + 1) / (SIMPLE_MAP?2:12), j / (SIMPLE_MAP?2:10)),
          d = point(side, i / (SIMPLE_MAP?2:12), (j + 1) / (SIMPLE_MAP?2:10)),
          e = point(side, (i + 1) / (SIMPLE_MAP?2:12), (j + 1) / (SIMPLE_MAP?2:10))
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
    if(SIMPLE_MAP)continue
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
