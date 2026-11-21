import type { BufferGeometry } from 'three'
import catalog from './models/geometry-catalog.json'

/** The exported GLBs belong to a particular source profile. A lower detail or
 * streamed source may already be smaller; do not download and decode an asset
 * that the strict replacement check would reject anyway. */
export function optimizedGeometryMatchesSource(file: string, sources: readonly BufferGeometry[]) {
  const asset = catalog[file as keyof typeof catalog]
  if (!asset) return true // New assets retain the loader's strict compatibility check.
  const parts: readonly { name: string; triangles: number; vertices: number; attributes?: readonly string[] }[] =
    file === 'detail-table-optimized.glb' ? asset.parts.filter(part => part.name === 'part-0') : asset.parts
  return sources.length === parts.length && sources.every((source, index) => {
    const part = parts[index]!, vertices = source.getAttribute('position')?.count, attributes = part.attributes
    return vertices === part.vertices && (source.index?.count ?? vertices) / 3 === part.triangles
      && (!attributes || Object.keys(source.attributes).every(name => attributes.includes(name)))
  })
}
