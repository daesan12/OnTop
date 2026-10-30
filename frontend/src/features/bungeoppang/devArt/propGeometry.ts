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
} from 'three/addons/utils/BufferGeometryUtils.js'
import { weldStaticVertices } from './weldStaticVertices'
import { recordPropBuild, takeBakedProp } from '../../../world/art/bakedProps'
import { indexedCopy } from './indexedGeometry'
import { lowPolyPrimitive } from './lowPolyPrimitive'
export type XYZ = [number, number, number]
export type PropFinish =
  'wood' | 'metal' | 'gold' | 'stone' | 'paint' | 'tile' | 'glow'

/** Build static, vertex-coloured material batches; dispose construction geometry immediately. */
export class PropBuilder {
  private readonly baked: ReturnType<typeof takeBakedProp>
  private boxSource?: BufferGeometry
  private sphereSource?: BufferGeometry
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
    retainSource = false,
    tintExisting = false,
  ) {
    if (this.baked) { if (!retainSource) g.dispose(); return }
    const source = tintExisting ? g : lowPolyPrimitive(g)
    const flat = indexedCopy(source)
    if (source !== g) source.dispose()
    if (!retainSource) g.dispose()
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
    const original = tintExisting ? flat.getAttribute('color') : undefined
    const c = new Color(color),
      colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r * (original?.getX(i) ?? 1)
      colors[i * 3 + 1] = c.g * (original?.getY(i) ?? 1)
      colors[i * 3 + 2] = c.b * (original?.getZ(i) ?? 1)
    }
    flat.setAttribute('color', new Float32BufferAttribute(colors, 3))
    this.parts[kind].push(flat)
  }
  box(k: PropFinish, c: string, p: XYZ, s: XYZ, r: XYZ = [0, 0, 0]) {
    if (this.baked) return
    this.add(k, this.boxSource ??= new BoxGeometry(1, 1, 1), c, p, s, r, true)
  }
  ball(k: PropFinish, c: string, p: XYZ, s: XYZ) {
    if (this.baked) return
    this.add(k, this.sphereSource ??= new SphereGeometry(1, Math.min(8, this.sphereSegments[0]), Math.min(4, this.sphereSegments[1])), c, p, s, [0, 0, 0], true)
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
      new CylinderGeometry(top, bottom, h, Math.min(8, segments)),
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
    this.add(k, new TorusGeometry(radius, tube, 3, 8), c, p, [1, 1, 1], r)
  }
  curve(
    k: PropFinish,
    c: string,
    points: XYZ[],
    radius: number,
    segments = 18,
  ) {
    if (this.baked) return
    this.add(
      k,
      new TubeGeometry(
        new CatmullRomCurve3(points.map((p) => new Vector3(...p))),
        Math.min(6, segments),
        radius,
        3,
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
        profile.map((v) => new Vector2(...v)),
        8,
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
    this.boxSource?.dispose(); this.sphereSource?.dispose()
    this.boxSource = this.sphereSource = undefined
    recordPropBuild(this.cacheKey, art)
    return art
  }
}
