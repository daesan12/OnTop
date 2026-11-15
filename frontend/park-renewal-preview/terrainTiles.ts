import { Box3, BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three'

const TILE_SIZE = 32

/** Preserve the original vertices, normals and triangles. Only partition draw bounds. */
export function terrainTiles(source: BufferGeometry) {
  const index = source.getIndex()
  if (!index) return [source]
  const positions = source.getAttribute('position')
  const tiles = new Map<string, { indices: number[]; bounds: Box3 }>()
  const a = new Vector3(), b = new Vector3(), c = new Vector3()
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2)
    a.fromBufferAttribute(positions, ia)
    b.fromBufferAttribute(positions, ib)
    c.fromBufferAttribute(positions, ic)
    const x = Math.floor((a.x + b.x + c.x) / (3 * TILE_SIZE))
    const z = Math.floor((a.z + b.z + c.z) / (3 * TILE_SIZE))
    const key = `${x}:${z}`
    let tile = tiles.get(key)
    if (!tile) {
      tile = { indices: [], bounds: new Box3() }
      tiles.set(key, tile)
    }
    tile.indices.push(ia, ib, ic)
    tile.bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c)
  }
  return Array.from(tiles.values(), ({ indices, bounds }) => {
    const geometry = new BufferGeometry()
    for (const name of Object.keys(source.attributes)) geometry.setAttribute(name, source.getAttribute(name))
    geometry.setIndex(new BufferAttribute(Uint32Array.from(indices), 1))
    geometry.boundingBox = bounds
    geometry.boundingSphere = bounds.getBoundingSphere(new Sphere())
    return geometry
  })
}
