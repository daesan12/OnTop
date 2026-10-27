import {
  Box3,
  Color,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  Object3D,
  Ray,
  Vector3,
  type BufferGeometry,
  type Intersection,
  type Raycaster,
} from 'three'
import {
  mergeGeometries,
} from 'three/addons/utils/BufferGeometryUtils.js'
import { weldStaticVertices } from './weldStaticVertices'
import type { Part, XYZ } from './Instances'

export interface SurfaceBatch {
  geometry: BufferGeometry
  parts: readonly Part[]
  mapping?: 'uv' | 'box'
  kind?: 'wood' | 'stone'
  meters?: number
  strength: number
  detail?: number
}
interface Range {
  bounds: Box3
  start: number
  count: number
}
interface Branch {
  bounds: Box3
  children?: [Branch, Branch]
  ranges?: Range[]
}
const trees = new WeakMap<BufferGeometry, Branch>()

function branch(ranges: Range[]): Branch {
  const bounds = new Box3()
  for (const range of ranges) bounds.union(range.bounds)
  if (ranges.length <= 8) return { bounds, ranges }
  const size = bounds.getSize(new Vector3())
  const axis =
    size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z'
  ranges.sort(
    (a, b) =>
      a.bounds.min[axis] +
      a.bounds.max[axis] -
      b.bounds.min[axis] -
      b.bounds.max[axis],
  )
  const middle = Math.floor(ranges.length / 2)
  return {
    bounds,
    children: [branch(ranges.slice(0, middle)), branch(ranges.slice(middle))],
  }
}

/** One static asset/material draw. Bake instance tint, physical box UVs and
 * per-part finish before transforming positions, so merging does not stretch
 * wood grain or erase normal-map/detail differences. Inputs remain shared. */
export function mergeSurfaceParts(
  batches: readonly SurfaceBatch[],
  assetScale: XYZ = [1, 1, 1],
) {
  const pieces: BufferGeometry[] = [],
    ranges: Range[] = []
  const object = new Object3D(),
    color = new Color()
  let start = 0
  for (const batch of batches) {
    for (const part of batch.parts) {
      const g = batch.geometry.index
        ? batch.geometry.toNonIndexed()
        : batch.geometry.clone()
      // Only attributes consumed by this material; no material groups/subdraws.
      for (const name of Object.keys(g.attributes))
        if (!['position', 'normal', 'uv'].includes(name))
          g.deleteAttribute(name)
      g.clearGroups()
      const p = g.getAttribute('position'),
        n = g.getAttribute('normal')
      const uv = new Float32Array(p.count * 2)
      const colors = new Float32Array(p.count * 3)
      const finish = new Float32Array(p.count * 2)
      const scale = part.s.map((v, i) => v * assetScale[i]!) as XYZ
      color.set(part.c)
      const sourceUv = g.getAttribute('uv')
      for (let i = 0; i < p.count; i++) {
        let u = sourceUv?.getX(i) ?? 0,
          v = sourceUv?.getY(i) ?? 0
        if (batch.mapping === 'box') {
          const x = p.getX(i) * scale[0],
            y = p.getY(i) * scale[1],
            z = p.getZ(i) * scale[2]
          const nx = Math.abs(n.getX(i)),
            ny = Math.abs(n.getY(i)),
            nz = Math.abs(n.getZ(i))
          let sx: number, sy: number
          if (ny >= nx && ny >= nz) [u, v, sx, sy] = [x, z, scale[0], scale[2]]
          else if (nx > nz) [u, v, sx, sy] = [z, y, scale[2], scale[1]]
          else [u, v, sx, sy] = [x, y, scale[0], scale[1]]
          if (batch.kind === 'wood' && sx > sy) [u, v] = [v, u]
          u = u / (batch.meters ?? 1.5) + part.p[0] * 0.173
          v = v / (batch.meters ?? 1.5) + part.p[2] * 0.173
        }
        uv[i * 2] = u
        uv[i * 2 + 1] = v
        color.toArray(colors, i * 3)
        finish[i * 2] = batch.strength
        finish[i * 2 + 1] = batch.detail ?? 1
      }
      g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
      g.setAttribute('color', new Float32BufferAttribute(colors, 3))
      g.setAttribute('surfaceFinish', new Float32BufferAttribute(finish, 2))
      object.position.set(...part.p)
      object.scale.set(...part.s)
      object.rotation.set(...(part.r ?? [0, 0, 0]))
      object.updateMatrix()
      g.applyMatrix4(object.matrix)
      g.computeBoundingBox()
      ranges.push({ bounds: g.boundingBox!.clone(), start, count: p.count })
      start += p.count
      pieces.push(g)
    }
  }
  if (!pieces.length)
    throw new Error('A static surface needs at least one part')
  const flat = mergeGeometries(pieces, false)!
  for (const piece of pieces) piece.dispose()
  // Recover the GPU vertex cache after baking. Attribute-aware deduplication
  // retains UV/normal/tint/finish seams. Index order is unchanged, so each
  // original triangle range remains valid for the raycast hierarchy.
  const geometry = weldStaticVertices(flat, 1e-6)
  flat.dispose()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  trees.set(geometry, branch(ranges))
  return geometry
}

const inverse = new Matrix4(),
  localRay = new Ray(),
  hit = new Vector3()
/** Retain exact triangle tests and openings without scanning the whole merged
 * monument. The hierarchy is built once, shared with its cached geometry. */
export function raycastStaticSurface(
  this: Mesh,
  raycaster: Raycaster,
  hits: Intersection[],
) {
  const geometry = this.geometry,
    tree = trees.get(geometry)
  if (!tree) return Mesh.prototype.raycast.call(this, raycaster, hits)
  inverse.copy(this.matrixWorld).invert()
  localRay.copy(raycaster.ray).applyMatrix4(inverse)
  const savedStart = geometry.drawRange.start,
    savedCount = geometry.drawRange.count
  const visit = (node: Branch) => {
    if (!localRay.intersectBox(node.bounds, hit)) return
    if (node.children) {
      visit(node.children[0])
      visit(node.children[1])
    } else
      for (const range of node.ranges!) {
        if (!localRay.intersectBox(range.bounds, hit)) continue
        geometry.setDrawRange(range.start, range.count)
        Mesh.prototype.raycast.call(this, raycaster, hits)
      }
  }
  try {
    visit(tree)
  } finally {
    geometry.setDrawRange(savedStart, savedCount)
  }
}
