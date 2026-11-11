import {normalizePath,type Plugin,type ResolvedConfig} from 'vite'
import {bakeRenewalStatic} from './renewalStaticBuild.ts'

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
      const {compressed,rawBytes,peakRssBytes}=await bakeRenewalStatic(config.root,config.mode)
      reference=this.emitFile({type:'asset',name:'renewal-static.bin.gz',source:compressed})
      this.info(`Prebuilt terrain/height/guards: ${rawBytes} -> ${compressed.byteLength} bytes; worker peak RSS ${Math.round(peakRssBytes/1024/1024)} MiB (exited)`)
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
