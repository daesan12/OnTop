import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { createMapArtifacts, SERVER_MAP_PATH, sha256 } from './map/artifacts.ts'
import { loadMapInput } from './map/load-input.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = resolve(root, 'generated/park-renewal')
const vite = await createServer({ root, configFile: false,
  optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, watch: null, ws: false } })

try {
  const [{ decodeStaticPark }, { installStaticPark }, archive, { sources }] = await Promise.all([
    vite.ssrLoadModule('/park-renewal-preview/static/codec.ts'),
    vite.ssrLoadModule('/park-renewal-preview/static/store.ts'),
    readFile(resolve(root, 'park-renewal-preview/original-park.bin.gz')),
    loadMapInput(root),
  ])
  const bytes = gunzipSync(archive)
  installStaticPark(decodeStaticPark(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
  const { buildRenewalMapData } = await vite.ssrLoadModule('/park-renewal-preview/live/data.ts')
  const data = buildRenewalMapData()
  const { server, manifest } = createMapArtifacts(data, sources)
  const content = JSON.stringify(server) + '\n'
  // The existing server loader verifies the artifact's logical path and byte checksum.
  // The actual files are read from the explicitly selected local directory.
  manifest.artifacts = [{ path: SERVER_MAP_PATH, sha256: sha256(content), bytes: Buffer.byteLength(content) }]
  manifest.validation = { ...manifest.validation, backendIntegration: 'local-renewal', liveServiceVersion: 'unchanged' }
  const baseBindings = JSON.parse(await readFile(resolve(root, 'public/park-bindings.generated.frontend-test.json'), 'utf8'))
  const bindings = ['channel-1', 'channel-2'].flatMap(channelId => data.tables.map(({ id: anchorId }) => {
    const bytes = createHash('md5').update(channelId + '\0' + anchorId).digest()
    bytes[6] = (bytes[6] & 15) | 48
    bytes[8] = (bytes[8] & 63) | 128
    const uuid = bytes.toString('hex').replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5')
    return { channelId, anchorId, tableId: 'table-' + uuid }
  }))
  await mkdir(out, { recursive: true })
  await Promise.all([
    writeFile(resolve(out, 'server-map.json'), content),
    writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'),
    writeFile(resolve(out, 'park-bindings.json'), JSON.stringify({ ...baseBindings, bindings }, null, 2) + '\n'),
  ])
  console.log(`[park-renewal] ${manifest.mapVersion} · ${manifest.counts.tables} tables · ${Buffer.byteLength(content)} bytes`)
} finally {
  await vite.close()
}
