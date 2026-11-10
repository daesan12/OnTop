import {createServer,normalizePath,type Plugin,type ResolvedConfig} from 'vite'
import {gzipSync} from 'node:zlib'
import {parkBindingsPlugin} from './parkBindingsPlugin.ts'

/** Fresh SSR module graph = current source, never a checked-in/cross-build cache.
 * The original builders remain the single source for preview and BE exporters. */
export function renewalStaticPlugin():Plugin {
  let config:ResolvedConfig,reference:string|undefined
  return {
    name:'renewal-static-prebuild',enforce:'pre',
    configResolved(value){config=value},
    async buildStart(){
      reference=undefined
      if(config.command!=='build'||config.build.ssr||process.env.PARK_STATIC_PREBUILD==='0')return
      const server=await createServer({root:config.root,configFile:false,mode:config.mode,
        plugins:[parkBindingsPlugin()],server:{middlewareMode:true},
        optimizeDeps:{noDiscovery:true,entries:[]},appType:'custom',logLevel:'error'})
      try {
        const {snapshot}=await server.ssrLoadModule('/src/park-renewal/static/snapshot.ts')
        const {encodeStaticPark,decodeStaticPark}=await server.ssrLoadModule('/src/park-renewal/static/codec.ts')
        const encoded:Uint8Array=encodeStaticPark(snapshot)
        // Catch incompatible codec/schema changes during the build, before ship.
        decodeStaticPark(encoded.buffer.slice(encoded.byteOffset,encoded.byteOffset+encoded.byteLength))
        const compressed=gzipSync(encoded,{level:9})
        reference=this.emitFile({type:'asset',name:'renewal-static.bin.gz',source:compressed})
        this.info(`Prebuilt terrain/height/guards: ${encoded.byteLength} -> ${compressed.byteLength} bytes`)
      }finally{await server.close()}
    },
    transform(_code,id){
      if(!reference||id.includes('?'))return
      const relative=normalizePath(id).slice(normalizePath(config.root).length)
      if(!['/src/main.tsx','/src/park-renewal/main.tsx'].includes(relative))return
      return {code:`import {loadStaticPark} from '/src/park-renewal/static/load.ts';
        loadStaticPark(import.meta.ROLLUP_FILE_URL_${reference}).then(()=>import(${JSON.stringify(normalizePath(id)+'?renewal-application')}));`,map:null}
    },
  }
}
