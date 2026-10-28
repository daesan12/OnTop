import type { BufferGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { PropFinish } from './propGeometry'

type Art = Partial<Record<PropFinish, BufferGeometry>>
const cache = new WeakMap<Art, Art>()

/** Opaque colour finishes now use the same diffuse shader. Keep stone separate
 * for camera occlusion, tiles for two-sided roofs, and glow for the night cycle.
 * Static source assets own the cached batches across mounts, just like the art. */
export function propRenderBatches(art: Art): Art {
  let result = cache.get(art)
  if (result) return result
  const solid = [art.wood, art.metal, art.gold, art.paint].filter((g): g is BufferGeometry => !!g)
  result = { ...art }
  delete result.wood; delete result.metal; delete result.gold; delete result.paint
  if (solid.length) result.paint = solid.length === 1 ? solid[0] : mergeGeometries(solid)!
  cache.set(art, result)
  return result
}
