// Procedural sculpting for the underground encounters (S15P31B105-450): faces with sockets, cheek hollows and a
// gaping mouth, bony hands with knuckles and nails, hanging hair, torn cloth, teeth and fur. Everything is built
// once into merged BufferGeometries, so a whole hand or a head of hair is one draw call.
import {
  BufferGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, TubeGeometry, Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type V = readonly [number, number, number]
const cache = new Map<string, BufferGeometry>()
/** Build once per key; encounter geometry is never disposed (dispose={null} on the meshes). */
export function cached(key: string, make: () => BufferGeometry) {
  let g = cache.get(key); if (!g) { g = make(); cache.set(key, g) } return g
}
function merge(parts: BufferGeometry[]) {
  const clean = parts.map(p => { const q = p.index ? p.toNonIndexed() : p; for (const name of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(name)) q.deleteAttribute(name); return q })
  const g = mergeGeometries(clean)!; parts.forEach(p => p.dispose()); clean.forEach(p => p.dispose()); return g
}
const rand = (n: number) => { const s = Math.sin(n * 91.345 + 47.853) * 43758.5453; return s - Math.floor(s) }
const UP = new Vector3(0, 1, 0)

/** Tapered tube from a to b (r0 at a, r1 at b). */
export function tube(a: V, b: V, r0: number, r1: number, sides = 8) {
  const from = new Vector3(...a), to = new Vector3(...b), d = to.clone().sub(from), length = d.length()
  const g = new CylinderGeometry(r1, r0, length, sides, 1, true)
  g.applyMatrix4(new Matrix4().compose(from.clone().add(to).multiplyScalar(.5), new Quaternion().setFromUnitVectors(UP, d.normalize()), new Vector3(1, 1, 1)))
  return g
}
export function ball(at: V, r: number, scale: V = [1, 1, 1], segments = 10) {
  return new SphereGeometry(r, segments, Math.max(6, segments - 3)).scale(...scale).translate(...at)
}
export function cone(at: V, dir: V, r: number, length: number, sides = 5) {
  const g = new ConeGeometry(r, length, sides), d = new Vector3(...dir).normalize()
  g.translate(0, length / 2, 0)
  g.applyMatrix4(new Matrix4().compose(new Vector3(...at), new Quaternion().setFromUnitVectors(UP, d), new Vector3(1, 1, 1)))
  return g
}

// ---------- heads ----------
export type FaceKind = { mouth: 'gape' | 'scream' | 'shut'; gaunt: number }
const gauss = (v: Vector3, c: V, r: number) => Math.exp(-((v.x - c[0]) ** 2 + (v.y - c[1]) ** 2 + (v.z - c[2]) ** 2) / (r * r))
/** Deform a unit-sphere direction into a skull-like face (front is +z). Shared by the mesh and by feature placement. */
export function faceSurface(dir: V, kind: FaceKind) { return faceShape(dir, kind).v }
/** The face surface point and how far it was pushed in (s < 1: sockets, hollows, mouth). */
export function faceShape(dir: V, kind: FaceKind) {
  const v = new Vector3(...dir).normalize(), k = kind.gaunt
  let s = 1
  s -= .17 * gauss(v, [.37, .17, .9], .22) + .17 * gauss(v, [-.37, .17, .9], .22) // eye sockets
  s += .05 * gauss(v, [0, .4, .9], .3) // brow ridge
  s -= k * .13 * (gauss(v, [.58, -.28, .74], .26) + gauss(v, [-.58, -.28, .74], .26)) // hollow cheeks
  s += .06 * (gauss(v, [.6, -.02, .77], .17) + gauss(v, [-.6, -.02, .77], .17)) // cheekbones
  s += .13 * gauss(v, [0, .02, 1], .11) // nose
  if (kind.mouth !== 'shut') s -= (kind.mouth === 'scream' ? .3 : .17) * gauss(v, [0, -.52, .86], kind.mouth === 'scream' ? .26 : .19)
  v.multiplyScalar(s)
  if (v.y < 0) { const t = -v.y; v.x *= 1 - .32 * t; v.z *= 1 - .08 * t; v.y *= 1 + (kind.mouth === 'scream' ? .5 : .28) * t }
  else v.z *= 1 + .05 * v.y
  return { v, s }
}
export const HEAD_SCALE: V = [.19, .24, .21]
export function headGeometry(kind: FaceKind) {
  return cached(`head-${kind.mouth}-${kind.gaunt}`, () => {
    const g = new SphereGeometry(1, 44, 34), p = g.getAttribute('position'), v = new Vector3(), col = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const n = v.clone().normalize(), { v: w, s } = faceShape([v.x, v.y, v.z], kind)
      p.setXYZ(i, w.x * HEAD_SCALE[0], w.y * HEAD_SCALE[1], w.z * HEAD_SCALE[2])
      // Baked occlusion: whatever was pushed in (sockets, hollow cheeks, the mouth) goes dark; lips and lids bruise.
      const dark = Math.min(.9, Math.max(0, (1 - s) * 4.2)), bruise = gauss(n, [0, -.52, .86], .3) * .5 + (gauss(n, [.37, .1, .9], .3) + gauss(n, [-.37, .1, .9], .3)) * .35
      col.set([(1 - dark) * (1 - bruise * .25), (1 - dark) * (1 - bruise * .55), (1 - dark) * (1 - bruise * .5)], i * 3)
    }
    g.setAttribute('color', new Float32BufferAttribute(col, 3))
    g.computeVertexNormals(); return g
  })
}
/** A point on the head surface (head-local), pushed `out` metres along the outward direction. */
export function facePoint(dir: V, kind: FaceKind, out = 0): V {
  const w = faceSurface(dir, kind), n = new Vector3(...dir).normalize()
  return [w.x * HEAD_SCALE[0] + n.x * out, w.y * HEAD_SCALE[1] + n.y * out, w.z * HEAD_SCALE[2] + n.z * out]
}
export const EYE_DIRS: readonly V[] = [[.37, .17, .9], [-.37, .17, .9]]
export const MOUTH_DIR: V = [0, -.55, .84]

/** Hair from the scalp: `fall` is the direction gravity pulls in head space; `veil` lets strands hang over the face. */
export function hairGeometry(key: string, length: number, fall: V = [0, -1, 0], veil = false, count = 230) {
  return cached('hair-' + key, () => {
    const parts: BufferGeometry[] = [], down = new Vector3(...fall).normalize()
    const shut: FaceKind = { mouth: 'shut', gaunt: 0 }
    for (let i = 0; i < count; i++) {
      // Golden-spiral roots over the crown and back of the head.
      const y = 1 - (i + .5) / count * 1.25, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996
      const dir = new Vector3(Math.cos(a) * r, y, Math.sin(a) * r)
      if (dir.dot(down) > .55) continue
      const face = dir.z > .35 && dir.y < .72
      if (face && !veil) continue
      const root = new Vector3(...facePoint([dir.x, dir.y, dir.z], shut, .006)).multiplyScalar(1.02)
      const len = length * (.7 + rand(i) * .5), out = dir.clone().multiplyScalar(.035 + rand(i + 3) * .03)
      const side = new Vector3(rand(i + 5) - .5, 0, rand(i + 7) - .5).multiplyScalar(.06)
      if (face) out.add(new Vector3(0, 0, .05))
      const pts = [root, root.clone().add(out), root.clone().add(out).addScaledVector(down, len * .35).add(side),
        root.clone().add(out.clone().multiplyScalar(.6)).addScaledVector(down, len * .7).add(side.clone().multiplyScalar(1.8)),
        root.clone().addScaledVector(down, len).add(side.clone().multiplyScalar(2.6))]
      parts.push(new TubeGeometry(new CatmullRomCurve3(pts), 8, .0032 + rand(i + 9) * .0022, 3, false))
    }
    return merge(parts)
  })
}

// ---------- hands and limbs ----------
export type HandStyle = { finger: number; spread: number; curl: number; thick: number; nails?: boolean }
/** A hand with the wrist at the origin, fingers along +y, palm facing +z. One merged geometry. */
export function handGeometry(key: string, s: HandStyle) {
  return cached('hand-' + key, () => {
    const parts: BufferGeometry[] = [ball([0, .045, 0], .05, [.95, 1.1, .38], 12)]
    const knuckles: [number, number][] = [[-.033, .088], [-.011, .096], [.011, .095], [.032, .086]]
    knuckles.forEach(([x, y], f) => {
      const len = s.finger * [.9, 1, .97, .78][f]!, splay = (f - 1.5) * s.spread
      let at = new Vector3(x, y, 0), dir = new Vector3(Math.sin(splay), Math.cos(splay), 0)
      const segs = [.45, .32, .23]
      segs.forEach((part, j) => {
        dir = dir.clone().applyAxisAngle(new Vector3(1, 0, 0), s.curl * (j + 1) * .5).normalize()
        const r = s.thick * (1 - j * .18), next = at.clone().addScaledVector(dir, len * part)
        parts.push(ball([at.x, at.y, at.z], r * 1.22, [1, 1, 1], 7), tube([at.x, at.y, at.z], [next.x, next.y, next.z], r, r * .86, 6))
        at = next
      })
      parts.push(ball([at.x, at.y, at.z], s.thick * .7, [1, 1, 1], 6))
      if (s.nails !== false) parts.push(cone([at.x, at.y, at.z + .002], [dir.x, dir.y, dir.z + .15], s.thick * .62, s.finger * .12, 4))
    })
    // Thumb, off the side of the palm towards the viewer.
    let at = new Vector3(-.045, .03, .012), dir = new Vector3(-.6, .75, .35).normalize()
    for (const part of [.28, .24]) { const next = at.clone().addScaledVector(dir, s.finger * part); parts.push(ball([at.x, at.y, at.z], s.thick * 1.25, [1, 1, 1], 7), tube([at.x, at.y, at.z], [next.x, next.y, next.z], s.thick * 1.15, s.thick, 6)); at = next; dir.applyAxisAngle(new Vector3(0, 0, 1), -.35) }
    return merge(parts)
  })
}
/** Bones of an arm or leg as one merged tube chain with joint balls. */
export function limbGeometry(key: string, points: readonly V[], radii: readonly number[]) {
  return cached('limb-' + key, () => {
    const parts: BufferGeometry[] = []
    for (let i = 1; i < points.length; i++) {
      parts.push(tube(points[i - 1]!, points[i]!, radii[i - 1]!, radii[i]!, 9))
      parts.push(ball(points[i - 1]!, radii[i - 1]! * 1.08, [1, 1, 1], 9))
    }
    return merge(parts)
  })
}
/** Quaternion that turns +y (a hand's fingers) towards `dir`, keeping the palm roughly towards +z. */
export function aim(dir: V, roll = 0) {
  const q = new Quaternion().setFromUnitVectors(UP, new Vector3(...dir).normalize())
  return q.multiply(new Quaternion().setFromAxisAngle(UP, roll))
}

// ---------- cloth ----------
/** Open hanging cloth (radius at the hem, narrower at the shoulders) with folds and a torn, uneven hem. */
export function tatteredGeometry(key: string, tear = .22, folds = 9) {
  return cached('cloth-' + key, () => {
    const g = new CylinderGeometry(.5, 1, 1, 64, 18, true), p = g.getAttribute('position')
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x)
      const fold = 1 + (.09 + (.5 - y) * .1) * Math.sin(a * folds + y * 2.1) + .05 * Math.cos(a * 4 - y * 3.2)
      const strip = Math.floor((a + Math.PI) / (Math.PI * 2) * 23), torn = (rand(strip + key.length) ** 2) * tear * (y < -.3 ? (-.3 - y) / .2 : 0)
      p.setXYZ(i, x * fold, y + torn + (.5 - y) * .04 * Math.sin(a * 5), z * fold * .78)
    }
    g.computeVertexNormals(); return g
  })
}
/** A deep hood: a sphere whose front is pushed in to leave a dark opening. */
export function hoodGeometry() {
  return cached('hood', () => {
    const g = new SphereGeometry(1, 36, 26), p = g.getAttribute('position'), v = new Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const front = gauss(v, [0, -.08, 1], .62)
      v.z -= front * 1.15; v.y += Math.max(0, v.y) * .25 * (1 - front); if (v.y < -.3) v.multiplyScalar(1 + (-.3 - v.y) * .35)
      v.x += .05 * Math.sin(v.y * 9) * (1 - front)
      p.setXYZ(i, v.x, v.y, v.z)
    }
    g.computeVertexNormals(); return g
  })
}
/** Teeth along an arc (x from -w..w), pointing along `dir`. */
export function teethGeometry(key: string, count: number, width: number, depth: number, dir: V, size: number) {
  return cached('teeth-' + key, () => merge(Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1) * 2 - 1, x = t * width, z = -depth * t * t
    return cone([x, 0, z], dir, size * (.6 + rand(i) * .5), size * (2.2 + rand(i + 1) * 1.8), 4)
  })))
}
/** Bristles over the top half of a unit ellipsoid of radii `r` (fur on a hunched back). */
export function furGeometry(key: string, r: V, count: number, length: number) {
  return cached('fur-' + key, () => merge(Array.from({ length: count }, (_, i) => {
    const y = 1 - (i + .5) / count * .95, rr = Math.sqrt(1 - y * y), a = i * 2.39996
    const d = new Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr), at: V = [d.x * r[0], d.y * r[1], d.z * r[2]]
    const dir: V = [d.x * .6, d.y + .3, d.z * .6 - .35]
    return cone(at, [dir[0] + (rand(i + 5) - .5) * .5, dir[1], dir[2] + (rand(i + 6) - .5) * .5], .011 + rand(i) * .008, length * (.35 + rand(i + 2) * .8), 3)
  })))
}
/** A lumpy body: sphere with low-frequency bumps (ribs and spine for the beast). */
export function lumpGeometry(key: string, spine = 0, ribs = 0, detail = 1) {
  return cached('lump-' + key, () => {
    const g = new SphereGeometry(1, Math.round(40 * detail), Math.round(28 * detail)), p = g.getAttribute('position'), v = new Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      let s = 1 + .04 * Math.sin(v.x * 7 + v.y * 5) * Math.cos(v.z * 6)
      s += spine * gauss(new Vector3(v.x, 0, 0), [0, 0, 0], .12) * Math.max(0, v.y) * (.6 + .4 * Math.sin(v.z * 22))
      s += ribs * Math.max(0, Math.abs(v.x) - .4) * Math.sin(v.z * 26) * Math.max(0, .6 - Math.abs(v.y))
      p.setXYZ(i, v.x * s, v.y * s, v.z * s)
    }
    g.computeVertexNormals(); return g
  })
}
