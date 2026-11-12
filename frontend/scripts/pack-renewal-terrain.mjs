import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const archive = new URL('../park-renewal-preview/original-park.bin.gz', import.meta.url)
const vite = await createServer({ root, configFile: false,
  optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, ws: false } })
try {
  const [{ decodeStaticPark, encodeStaticPark }, { groundBin, packGroundIndex }, original] = await Promise.all([
    vite.ssrLoadModule('/park-renewal-preview/static/codec.ts'),
    vite.ssrLoadModule('/park-renewal-preview/static/groundIndex.ts'),
    readFile(archive),
  ])
  const bytes = Uint8Array.from(gunzipSync(original))
  const snapshot = decodeStaticPark(bytes.buffer)
  const packed = packGroundIndex(snapshot.groundIndex)
  if ('bins' in snapshot.groundIndex) {
    assert.deepEqual(Array.from(packed.triangles), snapshot.groundIndex.triangles)
    for (const [key, ids] of snapshot.groundIndex.bins) assert.deepEqual(Array.from(groundBin(packed, key)), ids)
  }
  const repacked = encodeStaticPark({ ...snapshot, groundIndex: packed })
  const restored = decodeStaticPark(repacked.buffer)
  assert.deepEqual(encodeStaticPark(restored), repacked, 'Terrain archive must round-trip without data loss')
  const output = gzipSync(repacked, { level: 9 })
  if (process.argv.includes('--check')) assert.deepEqual(output, original, 'Terrain archive is not packed')
  else await writeFile(archive, output)
  console.log(`[park-renewal] terrain ${original.length} → ${output.length} bytes`)
} finally {
  await vite.close()
}
