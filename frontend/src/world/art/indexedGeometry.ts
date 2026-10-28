import { BufferAttribute, BufferGeometry } from 'three'

/** Copy buffers without invoking a subclass's default shape constructor.
 * An identity index lets mixed indexed/non-indexed parts merge without
 * expanding every triangle into duplicate vertex attributes first. */
export function indexedCopy(source: BufferGeometry) {
  const geometry = new BufferGeometry().copy(source)
  if (!geometry.index) {
    const count = geometry.getAttribute('position').count
    const indices = count > 65535 ? new Uint32Array(count) : new Uint16Array(count)
    for (let i = 0; i < count; i++) indices[i] = i
    geometry.setIndex(new BufferAttribute(indices, 1))
  }
  return geometry
}
