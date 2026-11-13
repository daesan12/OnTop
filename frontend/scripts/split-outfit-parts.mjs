import fs from 'node:fs/promises'
import path from 'node:path'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'

// Split a wardrobe outfit file (public/art/characters/outfits/<name>.glb, pieces item__<SLOT>__<id>)
// into skin-workshop PARTS files: one GLB per group, only that group's triangles and vertices,
// pieces renamed to the workshop's item__<SLOT>__a and listed on both the mesh and its node
// (the server reads node extras, the game reads the mesh's userData).
// Each mesh also lists what the item covers (extras.covers, e.g. SHOESg): worn, the game hides the base body
// there as it does for the wardrobe item (characterLook.ts coveredTokens). By default the file's own letter;
// covers:<group>=<letter> borrows another wardrobe item's (a robe made from the white dopo: covers:outfit=h).
// Usage: node scripts/split-outfit-parts.mjs <outfit.glb> <outDir> <name> [group=SLOT,SLOT ...] [covers:group=letter]
// Default groups: hair=HAIR face=FACE outfit=TOP,BOTTOM,SHOES
const [input, outDir, name, ...rest] = process.argv.slice(2)
const coverArgs = Object.fromEntries(rest.filter((a) => a.startsWith('covers:')).map((a) => a.slice(7).split('=')))
const groupArgs = rest.filter((a) => !a.startsWith('covers:'))
if (!input || !outDir || !name) throw new Error('Usage: split-outfit-parts.mjs <outfit.glb> <outDir> <name> [group=SLOT,SLOT]')
const defaultGroups = !groupArgs.length
const groups = groupArgs.length
  ? groupArgs.map((g) => { const [k, v] = g.split('='); return [k, v.split(',')] })
  : [['hair', ['HAIR']], ['face', ['FACE']], ['outfit', ['TOP', 'BOTTOM', 'SHOES']]]
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])

const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, BYTES = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }
const file = await fs.readFile(input)
if (file.readUInt32LE(0) !== 0x46546c67) throw new Error('Expected GLB')
const jsonLength = file.readUInt32LE(12)
const doc = JSON.parse(file.subarray(20, 20 + jsonLength).toString())
const bin = file.subarray(28 + jsonLength)

// Every bufferView as raw bytes (Meshopt decoded).
const raw = doc.bufferViews.map((view) => {
  const ext = view.extensions?.EXT_meshopt_compression
  if (!ext) return bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
  const out = new Uint8Array(ext.count * ext.byteStride)
  const src = bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength)
  MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, src, ext.mode, ext.filter ?? 'NONE')
  return Buffer.from(out.buffer)
})
const accessorBytes = (a) => {
  const stride = SIZE[a.type] * BYTES[a.componentType], data = raw[a.bufferView]
  return { stride, data: data.subarray(a.byteOffset ?? 0, (a.byteOffset ?? 0) + a.count * stride) }
}
const readIndex = (a) => {
  const { data } = accessorBytes(a)
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  return a.componentType === 5125 ? new Uint32Array(ab) : new Uint16Array(ab)
}
// item__TOP__s__under_TOPh_TOPs -> item__TOP__a__under_TOPh_TOPa: the file's own item letter becomes
// the workshop's `a` everywhere, so "hidden under its own top" still works; other letters (wardrobe
// items from other files) stay as they are.
const rename = (n) => {
  const m = n.match(/^item__([A-Z]+)__([a-z0-9]+)(.*)$/)
  if (!m) return n
  const own = m[2], rest = m[3].replace(/__under_(\w+)$/, (_, t) => '__under_' + t.split('_').map((tok) => tok.replace(new RegExp(`^([A-Z]+)${own}$`), '$1a')).join('_'))
  return `item__${m[1]}__a${rest}`
}

await fs.mkdir(outDir, { recursive: true })
const slotOf = (name) => name.match(/^item__([A-Z]+)__/)?.[1]
for (const [group, slots] of groups) {
  // Default groups the outfit has no pieces for (a hat-less outfit's face, say) are skipped; named ones must exist.
  if (!doc.meshes.some((mesh) => (mesh.extras?.pieces ?? []).some(([n]) => slots.includes(slotOf(n))))) {
    if (!defaultGroups) throw new Error(`No pieces for ${group}=${slots} in ${input}`)
    console.log(`skip ${group}: no ${slots.join(',')} pieces in this outfit`)
    continue
  }
  const out = structuredClone(doc)
  out.accessors = []; out.bufferViews = []
  const blobs = [] // [{data, target?, stride?, count?}]
  const addView = (data, extra = {}) => { blobs.push({ data, ...extra }); return blobs.length - 1 }
  const addAccessor = (acc) => { out.accessors.push(acc); return out.accessors.length - 1 }
  // Copy non-geometry views (image, inverse bind matrices) as they are.
  const imageView = addView(raw[doc.images[0].bufferView])
  out.images = doc.images.map((im) => ({ ...im, bufferView: imageView }))
  const ibmOld = doc.accessors[doc.skins[0].inverseBindMatrices]
  const ibm = addAccessor({ ...ibmOld, bufferView: addView(accessorBytes(ibmOld).data), byteOffset: 0 })
  out.skins = doc.skins.map((s) => ({ ...s, inverseBindMatrices: ibm }))
  const summary = []
  out.meshes = doc.meshes.map((mesh) => {
    const prim = mesh.primitives[0], idx = readIndex(doc.accessors[prim.indices])
    const kept = mesh.extras.pieces.filter(([n]) => slots.includes(slotOf(n)))
    if (!kept.length) throw new Error(`${mesh.name}: no pieces for ${slots}`)
    const total = kept.reduce((s, [, , c]) => s + c, 0)
    const remap = new Map(), order = []
    const newIdxRaw = new Uint32Array(total)
    let at = 0
    const pieces = kept.map(([n, start, count]) => {
      const first = at
      for (let i = start; i < start + count; i++) {
        let v = remap.get(idx[i])
        if (v === undefined) { v = order.length; remap.set(idx[i], v); order.push(idx[i]) }
        newIdxRaw[at++] = v
      }
      return [rename(n), first, count]
    })
    const big = order.length > 65535
    const newIdx = big ? newIdxRaw : Uint16Array.from(newIdxRaw)
    const attributes = {}
    for (const [key, ai] of Object.entries(prim.attributes)) {
      const a = doc.accessors[ai], { stride, data } = accessorBytes(a)
      const outData = Buffer.alloc(order.length * stride)
      order.forEach((v, i) => data.copy(outData, i * stride, v * stride, (v + 1) * stride))
      const acc = { bufferView: addView(outData, { target: 34962, stride, count: order.length }), componentType: a.componentType, count: order.length, type: a.type }
      if (a.normalized) acc.normalized = true
      if (key === 'POSITION') {
        const f = new Float32Array(outData.buffer, outData.byteOffset, order.length * 3), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
        for (let i = 0; i < f.length; i++) { min[i % 3] = Math.min(min[i % 3], f[i]); max[i % 3] = Math.max(max[i % 3], f[i]) }
        acc.min = min; acc.max = max
      }
      attributes[key] = addAccessor(acc)
    }
    const idxBytes = Buffer.from(newIdx.buffer, newIdx.byteOffset, newIdx.byteLength)
    const indices = addAccessor({ bufferView: addView(idxBytes, { target: 34963, stride: big ? 4 : 2, count: total }), componentType: big ? 5125 : 5123, count: total, type: 'SCALAR' })
    if (prim.targets?.length) throw new Error('Morph targets not supported by this splitter')
    const own = kept[0][0].match(/^item__[A-Z]+__([a-z0-9]+)/)[1], letter = coverArgs[group] ?? own
    const covers = letter === 'none' ? [] : slots.map((slot) => slot + letter)
    summary.push(`${mesh.name}: ${total / 3} tri, ${order.length} vert, covers ${covers.join(',') || '-'}, ${pieces.map((p) => p[0]).join(' ')}`)
    return { ...mesh, primitives: [{ ...prim, attributes, indices }], extras: { ...mesh.extras, pieces, covers } }
  })
  for (const node of out.nodes) if (node.mesh !== undefined) node.extras = { ...(node.extras ?? {}), pieces: out.meshes[node.mesh].extras.pieces, covers: out.meshes[node.mesh].extras.covers }

  // Pack: lossless Meshopt geometry (checked by decoding back), WebP image and matrices plain.
  const chunks = []; let offset = 0, fallback = 0
  const append = (bytes) => { const start = offset, padded = Buffer.alloc((bytes.length + 3) & ~3); Buffer.from(bytes).copy(padded); chunks.push(padded); offset += padded.length; return { byteOffset: start, byteLength: bytes.length } }
  out.bufferViews = blobs.map((b) => {
    if (!b.target) return { buffer: 0, ...append(b.data) }
    const mode = b.target === 34963 ? 'INDICES' : 'ATTRIBUTES'
    const data = new Uint8Array(b.data.buffer, b.data.byteOffset, b.data.byteLength)
    const encoded = MeshoptEncoder.encodeGltfBuffer(data, b.count, b.stride, mode)
    const check = new Uint8Array(data.length)
    MeshoptDecoder.decodeGltfBuffer(check, b.count, b.stride, encoded, mode)
    if (!Buffer.from(check).equals(Buffer.from(data))) throw new Error('Geometry compression changed bytes')
    const view = { buffer: 1, byteOffset: fallback, byteLength: data.length, target: b.target,
      extensions: { EXT_meshopt_compression: { buffer: 0, ...append(encoded), byteStride: b.stride, count: b.count, mode, filter: 'NONE' } } }
    fallback += (data.length + 3) & ~3
    return view
  })
  out.buffers = [{ byteLength: offset }, { byteLength: fallback, extensions: { EXT_meshopt_compression: { fallback: true } } }]
  out.asset = { ...doc.asset, generator: `${doc.asset.generator ?? ''} / split ${group}`.trim() }
  const json = Buffer.from(JSON.stringify(out)), jsonPadded = Buffer.alloc((json.length + 3) & ~3, 32)
  json.copy(jsonPadded)
  const binary = Buffer.concat(chunks), header = Buffer.alloc(20), bh = Buffer.alloc(8)
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonPadded.length + binary.length, 8)
  header.writeUInt32LE(jsonPadded.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
  bh.writeUInt32LE(binary.length, 0); bh.writeUInt32LE(0x004e4942, 4)
  const result = Buffer.concat([header, jsonPadded, bh, binary])
  const target = path.join(outDir, `${name}-${group}.glb`)
  await fs.writeFile(target, result)
  console.log(target, (result.length / 1e6).toFixed(2), 'MB')
  for (const s of summary) console.log('  ', s)
}
