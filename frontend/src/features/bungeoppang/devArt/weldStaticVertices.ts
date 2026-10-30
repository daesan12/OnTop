import { BufferAttribute, type BufferGeometry } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

/** Attribute-aware welding for static float geometry. Numeric hash buckets avoid
 * constructing a long decimal string for every vertex. Hash collisions are
 * checked against every quantized attribute, so seams and triangle order stay
 * identical to Three's mergeVertices. Repeated source indices reuse the first
 * result, avoiding repeated hashes for the same vertex. Other geometry uses the
 * general utility. */
export function weldStaticVertices(geometry: BufferGeometry, tolerance = 1e-6): BufferGeometry {
  const attributes = Object.entries(geometry.attributes)
  if (!geometry.getAttribute('position') || Object.keys(geometry.morphAttributes).length
    || attributes.some(([, attribute]) => !(attribute instanceof BufferAttribute)
      || !(attribute.array instanceof Float32Array) || attribute.normalized
      || attribute.itemSize < 1 || attribute.itemSize > 4)) return mergeVertices(geometry, tolerance)

  const sources = attributes.map(([name, attribute]) => ({ name, attribute: attribute as BufferAttribute }))
  const count = geometry.index?.count ?? geometry.getAttribute('position').count
  tolerance = Math.max(tolerance, Number.EPSILON)
  const multiplier = Math.pow(10, Math.log10(1 / tolerance))
  const additive = tolerance * .5 * multiplier
  const scratch = new Float64Array(sources.reduce((sum, { attribute }) => sum + attribute.itemSize, 0))
  const representatives = new Uint32Array(count), next = new Int32Array(count)
  const indices = new Uint32Array(count), buckets = new Map<number, number>()
  const remapped = geometry.index ? new Int32Array(geometry.getAttribute('position').count).fill(-1) : undefined
  let unique = 0
  for (let vertex = 0; vertex < count; vertex++) {
    const sourceIndex = geometry.index ? geometry.index.getX(vertex) : vertex
    const cached = remapped?.[sourceIndex]
    if (cached !== undefined && cached !== -1) {
      indices[vertex] = cached
      continue
    }
    let hash = 2166136261, component = 0
    for (const { attribute } of sources) {
      const offset = sourceIndex * attribute.itemSize
      for (let k = 0; k < attribute.itemSize; k++) {
        const value = Math.trunc(attribute.array[offset + k]! * multiplier + additive)
        if (!Number.isFinite(value)) return mergeVertices(geometry, tolerance)
        scratch[component++] = value
        hash = Math.imul(hash ^ value, 16777619)
      }
    }
    const head = buckets.get(hash) ?? -1
    let match = head
    candidates: for (; match !== -1; match = next[match]!) {
      component = 0
      for (const { attribute } of sources) {
        const offset = representatives[match]! * attribute.itemSize
        for (let k = 0; k < attribute.itemSize; k++) {
          if (Math.trunc(attribute.array[offset + k]! * multiplier + additive) !== scratch[component++]) continue candidates
        }
      }
      break
    }
    if (match === -1) {
      match = unique++
      representatives[match] = sourceIndex
      next[match] = head
      buckets.set(hash, match)
    }
    indices[vertex] = match
    if (remapped) remapped[sourceIndex] = match
  }
  const result = geometry.clone()
  for (const { name, attribute } of sources) {
    const output = new Float32Array(unique * attribute.itemSize)
    for (let i = 0; i < unique; i++) {
      const offset = representatives[i]! * attribute.itemSize
      for (let k = 0; k < attribute.itemSize; k++) output[i * attribute.itemSize + k] = attribute.array[offset + k]!
    }
    result.setAttribute(name, new BufferAttribute(output, attribute.itemSize))
  }
  result.setIndex(new BufferAttribute(unique > 65535 ? indices : new Uint16Array(indices), 1))
  return result
}
