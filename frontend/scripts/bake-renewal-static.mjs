import {createServer} from 'vite'
import {writeFile} from 'node:fs/promises'
import {gzipSync} from 'node:zlib'
import {parkBindingsPlugin} from './parkBindingsPlugin.ts'

const [root,mode,output,...extra]=process.argv.slice(2)
if(!root||!mode||!output||extra.length)throw Error('Usage: bake-renewal-static.mjs <root> <mode> <output>')
const server=await createServer({root,configFile:false,mode,
  plugins:[parkBindingsPlugin()],server:{middlewareMode:true},
  optimizeDeps:{noDiscovery:true,entries:[]},appType:'custom',logLevel:'error'})
try {
  const {snapshot}=await server.ssrLoadModule('/src/park-renewal/static/snapshot.ts')
  const {encodeStaticPark,decodeStaticPark}=await server.ssrLoadModule('/src/park-renewal/static/codec.ts')
  const encoded=encodeStaticPark(snapshot)
  // Fail the build if the archive cannot be restored before publishing it.
  decodeStaticPark(encoded.buffer.slice(encoded.byteOffset,encoded.byteOffset+encoded.byteLength))
  const compressed=gzipSync(encoded,{level:9})
  await writeFile(output,compressed)
  console.log(JSON.stringify({rawBytes:encoded.byteLength,compressedBytes:compressed.byteLength,
    peakRssBytes:process.resourceUsage().maxRSS*1024}))
}finally {
  await server.close()
}
// The parent waits for process exit, not just file creation. OS reclamation
// releases the SSR graph and CPU-side geometry without relying on dispose/GC.
