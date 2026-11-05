import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'

// Compress runtime characters exported uncompressed (float buffers, one PNG atlas) into
// public/art/characters, and refresh their manifest record and rig summary.
// Usage: node scripts/prepare-characters.mjs man=<man_raw.glb> girl=<girl_raw.glb> [outfit:general=<raw.glb>]
// Characters carry the shared body and their default items; an outfit file carries only its items
// (public/art/characters/outfits). Every mesh lists its pieces (extras.pieces) for the wardrobe.
const jobs = process.argv.slice(2).map((arg) => arg.split('='))
if (!jobs.length || jobs.some(([name, file]) => !(['man', 'girl'].includes(name) || /^outfit:[a-z0-9-]+$/.test(name)) || !file))
  throw new Error('Usage: node scripts/prepare-characters.mjs man=<raw.glb> girl=<raw.glb> [outfit:<name>=<raw.glb>]')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  out = path.join(root, 'public/art/characters')
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 },
  BYTES = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])

async function pack(input) {
  if (input.readUInt32LE(0) !== 0x46546c67) throw new Error('Expected GLB')
  const length = input.readUInt32LE(12),
    doc = JSON.parse(input.subarray(20, 20 + length).toString()),
    bin = input.subarray(28 + length)
  const chunks = []
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
  const viewAccessor = new Map(doc.accessors.map((a) => [a.bufferView, a]))
  const imageView = new Set(doc.images.map((i) => i.bufferView))
  const views = []
  for (let v = 0; v < doc.bufferViews.length; v++) {
    const view = doc.bufferViews[v],
      data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    if (imageView.has(v)) {
      // The atlas: lossy WebP at high quality (only transfer size; the GPU sees RGB8 either way).
      const encoded = await sharp(data).webp({ quality: 86 }).toBuffer()
      views.push({ buffer: 0, ...append(encoded) })
      continue
    }
    const a = viewAccessor.get(v)
    if (!view.target) {
      views.push({ buffer: 0, ...append(data) })                    // inverse bind matrices
      continue
    }
    // Geometry: lossless Meshopt, checked by decoding it back.
    const mode = view.target === 34963 ? 'INDICES' : 'ATTRIBUTES',
      stride = SIZE[a.type] * BYTES[a.componentType],
      count = data.length / stride,
      encoded = MeshoptEncoder.encodeGltfBuffer(data, count, stride, mode),
      decoded = new Uint8Array(data.length)
    MeshoptDecoder.decodeGltfBuffer(decoded, count, stride, encoded, mode)
    if (!Buffer.from(decoded).equals(data)) throw new Error('Geometry compression changed bytes')
    views.push({
      buffer: 1,
      byteOffset: fallback,
      byteLength: data.length,
      target: view.target,
      extensions: {
        EXT_meshopt_compression: { buffer: 0, ...append(encoded), byteStride: stride, count, mode, filter: 'NONE' },
      },
    })
    fallback += (data.length + 3) & ~3
  }
  const result = {
    ...doc,
    asset: { version: '2.0', generator: `${doc.asset.generator} / lossless Meshopt + WebP` },
    textures: doc.textures.map((t) => ({ sampler: t.sampler, extensions: { EXT_texture_webp: { source: t.source } } })),
    images: doc.images.map((i) => ({ ...i, mimeType: 'image/webp' })),
    bufferViews: views,
    buffers: [{ byteLength: offset }, { byteLength: fallback, extensions: { EXT_meshopt_compression: { fallback: true } } }],
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
  return { doc, output: Buffer.concat([header, jsonPadded, bh, binary]) }
}

const manifestFile = path.join(out, 'manifest.json'),
  manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'))
manifest.provenance =
  'User supplied Tripo drafts for this project; outfits generated in Tripo from the user’s own Gemini-edited sheets; no independent license assertion.'
manifest.process =
  'One shared bald base body (Tripo whole model, Mixamo 65-joint skin) dressed in layered items fitted onto it; every body piece and the default outfit’s items (an outfit file: its items only) joined and welded, triangles grouped by piece (mesh extras.pieces), arms posed down 20.5° and taken as the bind pose, scaled to 1.7 m, Mixamo weights summed onto the 49 identity-axis runtime joints (four normalized influences); near and far LODs by decimation, one fresh unwrap baked into one atlas; lossless Meshopt geometry.'
manifest.textureAtlas =
  'One 2048x2048 RGB colour WebP per character baked from the items’ own textures, shared across LODs/instances. No normal or metallic-roughness maps. WebP reduces transfer only; KTX2 GPU compression is not applied.'
for (const [job, file] of jobs) {
  const outfit = job.startsWith('outfit:'),
    name = outfit ? job.slice(7) : job,
    runtimeFile = outfit ? `outfits/${name}.glb` : `${name}.glb`
  const input = await fs.readFile(file),
    { doc, output } = await pack(input)
  await fs.mkdir(path.join(out, 'outfits'), { recursive: true })
  await fs.writeFile(path.join(out, runtimeFile), output)
  const parts = doc.meshes.map((mesh) => {
    const p = mesh.primitives[0]
    return { name: mesh.name, triangles: doc.accessors[p.indices].count / 3, vertices: doc.accessors[p.attributes.POSITION].count,
      pieces: (mesh.extras?.pieces ?? []).length }
  })
  const rig = doc.nodes.find((n) => n.name === 'CharacterRig').extras,
    tri = Object.fromEntries(parts.map((p) => [p.name.split('-')[0], p.triangles]))
  const record = {
    ...(outfit ? { outfit: name } : { character: name }),
    source: { file: path.basename(file), sha256: sha(input), bytes: input.length, triangles: tri.near, generator: 'Tripo items on a shared base (user supplied)' },
    runtime: { file: runtimeFile, sha256: sha(output), bytes: output.length, triangles: tri },
    heightMeters: rig.heightMeters,
    bones: doc.skins[0].joints.length,
    surfaceRevision: rig.surfaceRevision,
    parts,
    limitations: ['Pieces share one surface and atlas per file; the game draws the pieces an avatar wears (outfits from other files are drawn as their own mesh)', 'Authored idle/walk/run/swim clips (src/world/art/characterClips.json); seated, machine and gesture poses procedural; no facial rig or cloth simulation'],
  }
  const i = manifest.records.findIndex((r) => (outfit ? r.outfit : r.character) === name)
  if (i < 0) manifest.records.push(record)
  else manifest.records[i] = record
  if (outfit) {
    console.log(job, `${(input.length / 1e6).toFixed(2)} MB -> ${(output.length / 1e6).toFixed(2)} MB`, tri)
    continue
  }
  // Rig summary: each joint's rest position in model space (identity rest rotations, so translations add up).
  const parent = new Map()
  doc.nodes.forEach((n, k) => (n.children ?? []).forEach((c) => parent.set(c, k)))
  const landmarks = {}
  for (const j of doc.skins[0].joints) {
    const p = [0, 0, 0]
    for (let k = j; k !== undefined && doc.nodes[k].name !== 'CharacterRig'; k = parent.get(k))
      (doc.nodes[k].translation ?? [0, 0, 0]).forEach((v, a) => (p[a] += v))
    landmarks[doc.nodes[j].name] = p
  }
  const rigFile = path.join(out, `${name}-rig.json`)
  await fs.writeFile(
    rigFile,
    JSON.stringify(
      {
        variant: name,
        height: rig.heightMeters,
        hipHeight: rig.hipHeightMeters,
        rigVersion: rig.rigVersion,
        surfaceRevision: rig.surfaceRevision,
        bones: doc.skins[0].joints.map((j) => doc.nodes[j].name),
        parts,
        source: path.basename(file),
        sourceTriangles: tri.near,
        limitations: record.limitations,
        landmarks,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(name, `${(input.length / 1e6).toFixed(2)} MB -> ${(output.length / 1e6).toFixed(2)} MB`, tri)
}
await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
