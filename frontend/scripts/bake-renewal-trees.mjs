import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {gunzipSync} from 'node:zlib'
import {createServer} from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = new URL('../park-renewal-preview/static/trees.json', import.meta.url)
const vite = await createServer({root, configFile:false,
  optimizeDeps:{noDiscovery:true}, server:{middlewareMode:true,watch:null,ws:false}})

try {
  const [{decodeStaticPark},{installStaticPark},terrain] = await Promise.all([
    vite.ssrLoadModule('/park-renewal-preview/static/codec.ts'),
    vite.ssrLoadModule('/park-renewal-preview/static/store.ts'),
    readFile(new URL('../park-renewal-preview/original-park.bin.gz',import.meta.url)),
  ])
  const bytes = gunzipSync(terrain)
  installStaticPark(decodeStaticPark(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)))
  const {plantings,treeOverlapCleanup} = await vite.ssrLoadModule('/park-renewal-preview/landscape.ts')
  const json = JSON.stringify({plantings,cleanup:treeOverlapCleanup}) + '\n'
  if (process.argv.includes('--check')) assert.equal(await readFile(output,'utf8'),json,'Static tree placement is stale')
  else await writeFile(output,json)
  console.log(`[park-renewal] ${plantings.length} static tree placements`)
} finally {
  await vite.close()
}
