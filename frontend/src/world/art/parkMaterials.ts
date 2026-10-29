import { DoubleSide, MeshLambertMaterial, type BufferGeometry } from 'three'

// Module-owned, immutable materials survive park remounts like the shared art.
// Camera fading borrows private clones; it must never mutate these originals.
const front = new WeakMap<BufferGeometry, MeshLambertMaterial>()
const tile = new WeakMap<BufferGeometry, MeshLambertMaterial>()
export function parkPropMaterial(geometry: BufferGeometry, twoSided: boolean) {
  // Keep unrelated geometry in separate material/sort groups. Repeated copies
  // of one prop reuse both geometry and render state without mixing variants.
  const cache = twoSided ? tile : front
  let material = cache.get(geometry)
  if (!material) {
    material = new MeshLambertMaterial({ vertexColors: true, side: twoSided ? DoubleSide : 0 })
    cache.set(geometry, material)
  }
  return material
}
