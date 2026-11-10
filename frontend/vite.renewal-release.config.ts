import {defineConfig,loadEnv,mergeConfig,type Plugin} from 'vite'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import renewal from './vite.renewal.config.ts'
import {parkGeometryPlugin} from './scripts/parkGeometryPlugin.ts'
const root=fileURLToPath(new URL('.',import.meta.url))
const bindings:Plugin={name:'packaged-renewal-bindings',generateBundle(){
 for(const name of ['park-bindings.local.json','release.json'])this.emitFile({type:'asset',fileName:'generated/park-renewal/'+name,source:readFileSync(path.join(root,'generated/park-renewal',name))})
}}
const backend=process.env.PARK_RENEWAL_BACKEND_ORIGIN??'http://127.0.0.1:19190'
const https=process.env.PARK_RENEWAL_TLS_CERT&&process.env.PARK_RENEWAL_TLS_KEY?{
 cert:readFileSync(process.env.PARK_RENEWAL_TLS_CERT),key:readFileSync(process.env.PARK_RENEWAL_TLS_KEY),
}:undefined
export default defineConfig(({mode})=>mergeConfig(renewal,{
 // Match the current dev build while allowing an explicit deployment override.
 define:Object.fromEntries(['VITE_ALKKAGI_ENABLED','VITE_WARDROBE_OUTFITS','VITE_SKEWER_COOP_ENABLED'].map(key=>[
  'import.meta.env.'+key,JSON.stringify(loadEnv(mode,root,'VITE_')[key]??'true'),
 ])),
 plugins:[parkGeometryPlugin(),bindings],
 optimizeDeps:{entries:['index.html'],include:['@dimforge/rapier3d-compat']},
 server:{host:'127.0.0.1',port:5395,strictPort:true,https,proxy:{'/api/v1':{target:backend,changeOrigin:true},'/ws/tables':{target:backend,ws:true}}},
 build:{outDir:'dist-park-renewal',rollupOptions:{input:path.join(root,'index.html')}},
 preview:{host:'127.0.0.1',port:5394,strictPort:true,https,proxy:{'/api/v1':{target:backend,changeOrigin:true},'/ws/tables':{target:backend,ws:true}}},
}))
