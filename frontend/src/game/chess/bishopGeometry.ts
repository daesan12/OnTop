import { BufferGeometry, Float32BufferAttribute, Vector2, Vector3 } from 'three'

type Vertex = { p: Vector3; n: Vector3; uv: Vector2 }
type CutPlane = { normal: Vector3; constant: number }
const distance = (v: Vertex, plane: CutPlane) => plane.normal.dot(v.p) + plane.constant

function split(polygon: Vertex[], plane: CutPlane) {
  const inside: Vertex[] = [], outside: Vertex[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance(a, plane), db = distance(b, plane)
    if (da >= -1e-7) inside.push(a)
    if (da <= 1e-7) outside.push(a)
    if (da > 1e-7 && db < -1e-7 || da < -1e-7 && db > 1e-7) {
      const t = da / (da - db)
      const hit = { p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), uv: a.uv.clone().lerp(b.uv, t) }
      inside.push(hit); outside.push(hit)
    }
  }
  return { inside, outside }
}

/** Remove a narrow diagonal prism and close its three exposed faces; the mitre stays solid. */
export function bishopSlit(source: BufferGeometry) {
  const planes: CutPlane[] = [
    { normal: new Vector3(-1, 1, 0), constant: -1.14 },
    { normal: new Vector3(1, -1, 0), constant: 1.2 },
    { normal: new Vector3(1, 0, 0), constant: .085 },
  ]
  const mesh = source.toNonIndexed(), p = mesh.getAttribute('position'), n = mesh.getAttribute('normal'), uv = mesh.getAttribute('uv')
  const triangles: Vertex[][] = []
  for (let i = 0; i < p.count; i += 3) triangles.push([0, 1, 2].map(offset => ({
    p: new Vector3().fromBufferAttribute(p, i + offset), n: new Vector3().fromBufferAttribute(n, i + offset),
    uv: new Vector2(uv.getX(i + offset), uv.getY(i + offset)),
  })))
  const positions: number[] = [], normals: number[] = [], uvs: number[] = []
  const emit = (polygon: Vertex[]) => {
    for (let i = 1; i < polygon.length - 1; i++) {
      const vertices = [polygon[0], polygon[i], polygon[i + 1]]
      const cross = vertices[1].p.clone().sub(vertices[0].p).cross(vertices[2].p.clone().sub(vertices[0].p))
      if (cross.lengthSq() < 1e-16) continue
      for (const v of vertices) { positions.push(...v.p.toArray()); normals.push(...v.n.toArray()); uvs.push(...v.uv.toArray()) }
    }
  }
  for (const triangle of triangles) {
    let remaining = triangle
    for (const plane of planes) {
      if (remaining.length < 3) break
      const clipped = split(remaining, plane)
      emit(clipped.outside); remaining = clipped.inside
    }
  }
  for (const plane of planes) {
    const points = new Map<string, Vector3>()
    for (const triangle of triangles) for (let i = 0; i < 3; i++) {
      const a = triangle[i], b = triangle[(i + 1) % 3], da = distance(a, plane), db = distance(b, plane)
      if (da * db > 0 || Math.abs(da - db) < 1e-9) continue
      const point = a.p.clone().lerp(b.p, da / (da - db))
      points.set(point.toArray().map(value => Math.round(value * 1e6)).join(','), point)
    }
    if (points.size < 3) continue
    const center = [...points.values()].reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(points.size)
    const normal = plane.normal.clone().normalize()
    const u = new Vector3(0, 0, 1), v = normal.clone().cross(u)
    let polygon: Vertex[] = [...points.values()].sort((a, b) => {
      const aa = a.clone().sub(center), bb = b.clone().sub(center)
      return Math.atan2(aa.dot(v), aa.dot(u)) - Math.atan2(bb.dot(v), bb.dot(u))
    }).map(point => ({ p: point, n: normal, uv: new Vector2(point.dot(u), point.dot(v)) }))
    for (const other of planes) if (other !== plane) polygon = split(polygon, other).inside
    emit(polygon)
  }
  mesh.dispose()
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setAttribute('normal', new Float32BufferAttribute(normals, 3)).setAttribute('uv', new Float32BufferAttribute(uvs, 2))
}
