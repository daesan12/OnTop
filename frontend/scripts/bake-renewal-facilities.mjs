import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { Group, Mesh, MeshBasicMaterial } from 'three'
import { createServer } from 'vite'
import { MeshoptEncoder } from 'meshoptimizer/encoder'

const root = fileURLToPath(new URL('../', import.meta.url))
const archive = new URL('../park-renewal-preview/static/facilities.bin.gz', import.meta.url)
const vite = await createServer({ root, configFile: false,
  optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, ws: false } })

function canonicalJSON(object) {
  const ids = new Map()
  const json = JSON.stringify(object.toJSON(), (_, value) => {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) return value
    if (!ids.has(value)) ids.set(value, '00000000-0000-4000-8000-' + String(ids.size).padStart(12, '0'))
    return ids.get(value)
  })
  return { data: JSON.parse(json), ids }
}

try {
  const [{ decodeStaticPark }, { installStaticPark }, source] = await Promise.all([
    vite.ssrLoadModule('/park-renewal-preview/static/codec.ts'),
    vite.ssrLoadModule('/park-renewal-preview/static/store.ts'),
    readFile(new URL('../park-renewal-preview/original-park.bin.gz', import.meta.url)),
  ])
  const bytes = gunzipSync(source)
  installStaticPark(decodeStaticPark(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
  const [{ factory }, { bakedLakeKinds, decodeBakedFacilities, entryMeshNames }, { createArcadeArt }, { encodeBakedProps }] = await Promise.all([
    vite.ssrLoadModule('/park-renewal-preview/assetFactories.js'),
    vite.ssrLoadModule('/park-renewal-preview/static/facilities.ts'),
    vite.ssrLoadModule('/park-renewal-preview/static/arcadeArt.ts'),
    vite.ssrLoadModule('/src/world/art/bakedProps.ts'),
  ])
  const rootGroup = new Group()
  rootGroup.name = 'renewal-static-facilities-v1'
  for (const kind of bakedLakeKinds) {
    const holder = new Group()
    holder.name = kind
    holder.add(factory(kind))
    rootGroup.add(holder)
  }
  const arcade = new Group()
  arcade.name = 'arcade'
  const placeholder = new MeshBasicMaterial()
  for (const [part, art] of Object.entries(createArcadeArt())) {
    const group = new Group()
    group.name = part
    for (const [finish, geometry] of Object.entries(art)) {
      const mesh = new Mesh(geometry, placeholder)
      mesh.name = finish
      group.add(mesh)
    }
    arcade.add(group)
  }
  rootGroup.add(arcade)
  const [{ createTowerFrame }, { createParkWall }, { OBSERVATION_TOWER }] = await Promise.all([
    vite.ssrLoadModule('/park-renewal-preview/original/world/art/towerFrameGeometry.ts'),
    vite.ssrLoadModule('/park-renewal-preview/parkWallGeometry.ts'),
    vite.ssrLoadModule('/src/config/index.ts'),
  ])
  const wall = createParkWall()
  const entryMeshes = new Group()
  entryMeshes.name = 'entry-meshes'
  const entry = {
    'tower-frame': createTowerFrame(40 / OBSERVATION_TOWER.height),
    'tower-frame-distant': createTowerFrame(40 / OBSERVATION_TOWER.height, 'distant'),
    'wall-body': wall.body, 'wall-foot': wall.foot, 'wall-clay': wall.clay, 'wall-timber': wall.timber,
  }
  for (const name of entryMeshNames) {
    const mesh = new Mesh(entry[name], placeholder)
    mesh.name = name
    entryMeshes.add(mesh)
  }
  rootGroup.add(entryMeshes)
  const { data, ids } = canonicalJSON(rootGroup)
  assert.equal(data.images, undefined, 'Keep generated textures in the live scene')
  const geometries = new Map()
  rootGroup.traverse(mesh => {
    if (mesh.isMesh) geometries.set(ids.get(mesh.geometry.uuid), { stone: mesh.geometry })
  })
  const header = Buffer.from(JSON.stringify({ object: data.object, materials: data.materials }))
  await MeshoptEncoder.ready
  const packed = encodeBakedProps(geometries, (bytes, count, stride, mode) => mode === 'INDICES'
    ? MeshoptEncoder.encodeIndexSequence(bytes, count, stride)
    : MeshoptEncoder.encodeVertexBufferLevel(bytes, count, stride, 3))
  const length = Buffer.alloc(4)
  length.writeUInt32LE(header.length)
  const buffer = Buffer.concat([length, header, packed])
  const restored = await decodeBakedFacilities(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
  assert.deepEqual(restored.toJSON().object, data.object)
  restored.traverse(mesh => {
    if (!mesh.isMesh) return
    const original = geometries.get(mesh.geometry.uuid).stone
    assert.deepEqual(mesh.geometry.index?.array, original.index?.array)
    for (const [key, attribute] of Object.entries(original.attributes))
      assert.deepEqual(mesh.geometry.getAttribute(key).array, attribute.array)
  })
  const compressed = gzipSync(buffer, { level: 9 })
  if (process.argv.includes('--check')) assert.deepEqual(await readFile(archive), compressed, 'Static facilities archive is stale')
  else await writeFile(archive, compressed)
  console.log(`[park-renewal] ${rootGroup.children.length} static facilities, ${compressed.length} bytes`)
} finally {
  await vite.close()
}
