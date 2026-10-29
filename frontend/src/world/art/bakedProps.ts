import { BufferAttribute, BufferGeometry, Box3, Sphere, Vector3 } from 'three'
import type { PropFinish } from './propGeometry'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

export type PropArt = Partial<Record<PropFinish, BufferGeometry>>
const available = new Map<string, PropArt>()
let captured: Map<string, PropArt> | undefined
let proceduralStarted = false
export const hasProceduralProps = () => proceduralStarted

/** Build tooling captures a snapshot before callers adjust a finished prop. */
export function capturePropBuilds() {
  captured = new Map()
  return captured
}
export function recordPropBuild(key: string | undefined, art: PropArt) {
  if (!captured || !key) return
  if (captured.has(key)) throw new Error(`Duplicate baked prop: ${key}`)
  captured.set(key, Object.fromEntries(Object.entries(art).map(([name, g]) => [name, g.clone()])))
}
export function takeBakedProp(key: string | undefined) {
  if (!key) return undefined
  const art = available.get(key)
  if (!art) proceduralStarted = true
  available.delete(key)
  return art
}

type ArrayDescription = { offset: number; length: number; type: 'f32' | 'u16' | 'u32'; itemSize: number; normalized: boolean; encodedLength?: number; mode?: 'ATTRIBUTES' | 'INDICES' }
interface GeometryDescription {
  attributes: Record<string, ArrayDescription>
  index?: ArrayDescription
  groups: BufferGeometry['groups']
  drawStart: number
  drawCount: number | null
  sphere: { center: number[]; radius: number } | null
  box: { min: number[]; max: number[] } | null
  name: string
  userData: Record<string, unknown>
}
type Manifest = Record<string, Partial<Record<PropFinish, GeometryDescription>>>
const align = (n: number) => Math.ceil(n / 4) * 4

/** Lossless Float32 attributes and original index order; no mesh quantization. */
export function encodeBakedProps(props: Map<string, PropArt>, encode?: (bytes: Uint8Array, count: number, stride: number, mode: 'ATTRIBUTES' | 'INDICES') => Uint8Array) {
  const chunks: { offset: number; bytes: Uint8Array; signature: string }[] = []
  let length = 0
  const attribute = (value: BufferAttribute, mode: 'ATTRIBUTES' | 'INDICES' = 'ATTRIBUTES'): ArrayDescription => {
    const array = value.array
    const type = array instanceof Float32Array ? 'f32' : array instanceof Uint16Array ? 'u16' : array instanceof Uint32Array ? 'u32' : null
    if (!type) throw new Error('Unsupported baked prop attribute')
    const offset = align(length)
    const source = new Uint8Array(array.buffer, array.byteOffset, array.byteLength)
    const bytes = encode ? encode(source, value.count, value.itemSize * array.BYTES_PER_ELEMENT, mode) : source
    const signature = `${mode}:${type}:${value.itemSize}:${array.length}`
    // Encoded streams decode into independent arrays. Share identical streams
    // (e.g. pavilion positions/indices across UV scales), not mutable geometry.
    const prior = encode && chunks.find(chunk => chunk.signature === signature && chunk.bytes.length === bytes.length
      && chunk.bytes.every((value, i) => value === bytes[i]))
    if (prior) return { offset: prior.offset, length: array.length, type, itemSize: value.itemSize,
      normalized: value.normalized, encodedLength: bytes.length, mode }
    chunks.push({ offset, bytes, signature })
    length = offset + bytes.length
    return { offset, length: array.length, type, itemSize: value.itemSize, normalized: value.normalized,
      ...(encode ? { encodedLength: bytes.length, mode } : {}) }
  }
  const manifest: Manifest = Object.fromEntries([...props].map(([key, art]) => [key,
    Object.fromEntries(Object.entries(art).map(([finish, geometry]) => [finish, {
      attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, value]) => {
        if (!(value instanceof BufferAttribute)) throw new Error('Interleaved baked prop attribute')
        return [name, attribute(value)]
      })),
      ...(geometry.index ? { index: attribute(geometry.index, 'INDICES') } : {}),
      groups: geometry.groups,
      drawStart: geometry.drawRange.start,
      drawCount: Number.isFinite(geometry.drawRange.count) ? geometry.drawRange.count : null,
      sphere: geometry.boundingSphere ? { center: geometry.boundingSphere.center.toArray(), radius: geometry.boundingSphere.radius } : null,
      box: geometry.boundingBox ? { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() } : null,
      name: geometry.name, userData: geometry.userData,
    }]))]))
  const header = new TextEncoder().encode(JSON.stringify(manifest))
  const start = align(8 + header.length)
  const bytes = new Uint8Array(start + length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x3150474f, true) // OGP1
  view.setUint32(4, header.length, true)
  bytes.set(header, 8)
  for (const chunk of chunks) bytes.set(chunk.bytes, start + chunk.offset)
  return bytes
}

export async function decodeBakedProps(buffer: ArrayBuffer) {
  await MeshoptDecoder.ready
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== 0x3150474f) throw new Error('Invalid baked prop version')
  const headerLength = view.getUint32(4, true), start = align(8 + headerLength)
  const manifest = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, headerLength))) as Manifest
  const attribute = (d: ArrayDescription) => {
    const ArrayType = d.type === 'f32' ? Float32Array : d.type === 'u16' ? Uint16Array : d.type === 'u32' ? Uint32Array : null
    if (!ArrayType) throw new Error('Invalid baked prop attribute')
    let array: Float32Array | Uint16Array | Uint32Array
    if (d.encodedLength !== undefined && d.mode) {
      array = new ArrayType(d.length)
      MeshoptDecoder.decodeGltfBuffer(new Uint8Array(array.buffer), d.length / d.itemSize,
        d.itemSize * array.BYTES_PER_ELEMENT, new Uint8Array(buffer, start + d.offset, d.encodedLength), d.mode)
    } else array = new ArrayType(buffer, start + d.offset, d.length)
    return new BufferAttribute(array, d.itemSize, d.normalized)
  }
  return new Map(Object.entries(manifest).map(([key, art]) => [key,
    Object.fromEntries(Object.entries(art).map(([finish, d]) => {
      const g = new BufferGeometry()
      for (const [name, value] of Object.entries(d.attributes)) g.setAttribute(name, attribute(value))
      if (d.index) g.setIndex(attribute(d.index))
      g.groups = d.groups
      g.setDrawRange(d.drawStart, d.drawCount ?? Infinity)
      if (d.sphere) g.boundingSphere = new Sphere(new Vector3().fromArray(d.sphere.center), d.sphere.radius)
      if (d.box) g.boundingBox = new Box3(new Vector3().fromArray(d.box.min), new Vector3().fromArray(d.box.max))
      g.name = d.name; g.userData = d.userData
      return [finish, g]
    })) as PropArt]))
}

export async function installBakedProps(buffer: ArrayBuffer, beforeProceduralOnly = false) {
  // Publish only after the whole file has decoded successfully.
  const props = await decodeBakedProps(buffer)
  if (beforeProceduralOnly && proceduralStarted) return false
  for (const [key, art] of props) available.set(key, art)
  return true
}
