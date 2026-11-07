import { BufferGeometry, Float32BufferAttribute } from 'three'

export type ExteriorRegion = { x: number; z: number; halfWidth: number; depth: number }
type Vertex = Record<string, number[]>

/** Copy only visible park sectors and cut the terrace edge, leaving shared park assets untouched. */
export function parkExteriorGeometry(source: BufferGeometry, region: ExteriorRegion) {
  const attributes = Object.entries(source.attributes).filter(([name]) => ['position', 'normal', 'color', 'uv'].includes(name))
  const arrays = Object.fromEntries(attributes.map(([name]) => [name, [] as number[]]))
  const position = source.getAttribute('position'), index = source.getIndex(), count = index?.count ?? position.count
  const vertex = (i: number): Vertex => Object.fromEntries(attributes.map(([name, attr]) => [name, Array.from({ length: attr.itemSize }, (_, c) => c === 0 ? attr.getX(i) : c === 1 ? attr.getY(i) : c === 2 ? attr.getZ(i) : attr.getW(i))]))
  for (let i = 0; i < count; i += 3) {
    const indices = [0, 1, 2].map(offset => index ? index.getX(i + offset) : i + offset)
    const xs = indices.map(i => position.getX(i)), zs = indices.map(i => position.getZ(i))
    if (Math.max(...xs) < region.x - region.halfWidth || Math.min(...xs) > region.x + region.halfWidth
      || Math.max(...zs) < region.z || Math.min(...zs) > region.z + region.depth) continue
    const triangle = indices.map(vertex)
    // Split a crossing triangle at z=terrace, carrying its original colors/normals/UVs.
    const polygon: Vertex[] = []
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge], b = triangle[(edge + 1) % 3], insideA = a.position[2] >= region.z, insideB = b.position[2] >= region.z
      if (insideA) polygon.push(a)
      if (insideA !== insideB) {
        const t = (region.z - a.position[2]) / (b.position[2] - a.position[2])
        polygon.push(Object.fromEntries(attributes.map(([name]) => [name, a[name].map((v, c) => v + (b[name][c] - v) * t)])))
      }
    }
    for (let j = 1; j + 1 < polygon.length; j++) for (const v of [polygon[0], polygon[j], polygon[j + 1]])
      for (const [name] of attributes) arrays[name].push(...v[name])
  }
  const result = new BufferGeometry()
  for (const [name, attr] of attributes) result.setAttribute(name, new Float32BufferAttribute(arrays[name], attr.itemSize))
  result.computeBoundingSphere()
  return result
}
