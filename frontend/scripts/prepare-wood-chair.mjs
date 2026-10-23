import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'

// Keep the source outside the runtime package; extract the same chair island used by the prototype.
const source = process.argv[2]
if (!source)
  throw new Error(
    'Usage: node scripts/prepare-wood-chair.mjs <original-model.glb>',
  )
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const input = await fs.readFile(source),
  length = input.readUInt32LE(12)
if (input.readUInt32LE(0) !== 0x46546c67) throw new Error('Expected GLB')
const doc = JSON.parse(input.subarray(20, 20 + length).toString()),
  bin = input.subarray(28 + length)
const primitive = doc.meshes[0].primitives[0]
function accessor(index) {
  const a = doc.accessors[index],
    view = doc.bufferViews[a.bufferView],
    count = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type],
    offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0)
  if (view.byteStride || a.sparse) throw new Error('Unexpected source accessor')
  return {
    a,
    count,
    values:
      a.componentType === 5126
        ? new Float32Array(bin.buffer, bin.byteOffset + offset, a.count * count)
        : new Uint16Array(bin.buffer, bin.byteOffset + offset, a.count * count),
  }
}
const positions = accessor(primitive.attributes.POSITION),
  indices = accessor(primitive.indices).values
const selected = []
for (let i = 0; i < indices.length; i += 3) {
  const ids = [indices[i], indices[i + 1], indices[i + 2]],
    x = ids.reduce((s, id) => s + positions.values[id * 3], 0) / 3,
    z = ids.reduce((s, id) => s + positions.values[id * 3 + 2], 0) / 3
  if (z > Math.abs(x)) selected.push(...ids)
}
if (!selected.length) throw new Error('No chair surface')
const vertexIds = [...new Set(selected)],
  remap = new Map(vertexIds.map((id, i) => [id, i]))
const min = [Infinity, Infinity, Infinity],
  max = [-Infinity, -Infinity, -Infinity]
for (const id of vertexIds)
  for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], positions.values[id * 3 + k])
    max[k] = Math.max(max[k], positions.values[id * 3 + k])
  }
const scale = 0.56 / -min[1]
const chunks = [],
  views = [],
  accessors = [],
  images = [],
  textures = []
let offset = 0,
  fallback = 0
function append(bytes) {
  const start = offset,
    padded = Buffer.alloc((bytes.length + 3) & ~3)
  Buffer.from(bytes).copy(padded)
  chunks.push(padded)
  offset += padded.length
  return { byteOffset: start, byteLength: bytes.length }
}
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])
function geometryView(data, stride, mode) {
  const encoded = MeshoptEncoder.encodeGltfBuffer(
      data,
      data.length / stride,
      stride,
      mode,
    ),
    decoded = new Uint8Array(data.length)
  MeshoptDecoder.decodeGltfBuffer(
    decoded,
    data.length / stride,
    stride,
    encoded,
    mode,
  )
  if (!Buffer.from(decoded).equals(data))
    throw new Error('Geometry compression changed bytes')
  const index = views.length
  views.push({
    buffer: 1,
    byteOffset: fallback,
    byteLength: data.length,
    target: mode === 'ATTRIBUTES' ? 34962 : 34963,
    extensions: {
      EXT_meshopt_compression: {
        buffer: 0,
        ...append(encoded),
        byteStride: stride,
        count: data.length / stride,
        mode,
        filter: 'NONE',
      },
    },
  })
  fallback += (data.length + 3) & ~3
  return index
}
const attributes = {}
for (const name of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
  const a = accessor(primitive.attributes[name]),
    values = new Float32Array(vertexIds.length * a.count)
  for (let i = 0; i < vertexIds.length; i++)
    for (let k = 0; k < a.count; k++) {
      let value = a.values[vertexIds[i] * a.count + k]
      if (name === 'POSITION')
        value = (value - (k === 1 ? min[1] : (min[k] + max[k]) / 2)) * scale
      values[i * a.count + k] = value
    }
  attributes[name] = accessors.length
  const next = {
    bufferView: geometryView(
      Buffer.from(values.buffer),
      a.count * 4,
      'ATTRIBUTES',
    ),
    componentType: 5126,
    count: vertexIds.length,
    type: a.a.type,
  }
  if (name === 'POSITION') {
    next.min = [0, 1, 2].map((k) =>
      Math.min(...values.filter((_, i) => i % 3 === k)),
    )
    next.max = [0, 1, 2].map((k) =>
      Math.max(...values.filter((_, i) => i % 3 === k)),
    )
  }
  accessors.push(next)
}
const mapped = new Uint16Array(selected.map((id) => remap.get(id))),
  indexAccessor = accessors.length
accessors.push({
  bufferView: geometryView(Buffer.from(mapped.buffer), 2, 'INDICES'),
  componentType: 5123,
  count: mapped.length,
  type: 'SCALAR',
})
const textureRecords = []
for (let i = 0; i < doc.images.length; i++) {
  const image = doc.images[i],
    view = doc.bufferViews[image.bufferView],
    raw = bin.subarray(
      view.byteOffset ?? 0,
      (view.byteOffset ?? 0) + view.byteLength,
    ),
    metadata = await sharp(raw).metadata(),
    color =
      i ===
      doc.textures[doc.materials[0].pbrMetallicRoughness.baseColorTexture.index]
        .source
  const target = color ? 2048 : 1024,
    encoded = await sharp(raw)
      .resize({
        width: target,
        height: target,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: color ? 96 : 94 })
      .toBuffer()
  const bufferView = views.length
  views.push({ buffer: 0, ...append(encoded) })
  images.push({ name: image.name, mimeType: 'image/webp', bufferView })
  textureRecords.push({
    name: image.name,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    targetMax: target,
    bytes: encoded.length,
  })
}
for (const texture of doc.textures)
  textures.push({
    ...texture,
    source: undefined,
    extensions: { EXT_texture_webp: { source: texture.source } },
  })
const result = {
  asset: {
    version: '2.0',
    generator: 'OnTop chair island extraction / Meshopt / WebP',
  },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: 'WoodChair', mesh: 0 }],
  meshes: [
    {
      name: 'WoodChair',
      primitives: [{ attributes, indices: indexAccessor, material: 0 }],
    },
  ],
  materials: doc.materials,
  samplers: doc.samplers,
  textures,
  images,
  accessors,
  bufferViews: views,
  buffers: [
    { byteLength: offset },
    {
      byteLength: fallback,
      extensions: { EXT_meshopt_compression: { fallback: true } },
    },
  ],
  extensionsUsed: ['EXT_meshopt_compression', 'EXT_texture_webp'],
  extensionsRequired: ['EXT_meshopt_compression', 'EXT_texture_webp'],
}
const json = Buffer.from(JSON.stringify(result)),
  jsonPadded = Buffer.alloc((json.length + 3) & ~3, 32)
json.copy(jsonPadded)
const binary = Buffer.concat(chunks),
  header = Buffer.alloc(20),
  bh = Buffer.alloc(8)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(28 + jsonPadded.length + binary.length, 8)
header.writeUInt32LE(jsonPadded.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
bh.writeUInt32LE(binary.length, 0)
bh.writeUInt32LE(0x004e4942, 4)
const output = Buffer.concat([header, jsonPadded, bh, binary]),
  destination = path.join(root, 'public/art/props/wood-chair.glb')
await fs.writeFile(destination, output)
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')
const manifest = {
  source: {
    file: path.basename(source),
    sha256: sha(input),
    bytes: input.length,
    triangles: indices.length / 3,
  },
  runtime: {
    file: 'wood-chair.glb',
    sha256: sha(output),
    bytes: output.length,
    triangles: mapped.length / 3,
    materials: 1,
    textures: textureRecords,
  },
  provenance:
    'Chair island extracted from the existing user-supplied Tripo table set. No new license assertion.',
  optimization:
    'One chair geometry/material instanced per table. Lossless Meshopt geometry, WebP color 2048 and normal/ORM up to 1024. No KTX2. One small static prop LOD; table/sector culling retained. Populated-scene measurements required.',
}
await fs.writeFile(
  path.join(root, 'public/art/props/wood-chair.manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log(JSON.stringify(manifest))
