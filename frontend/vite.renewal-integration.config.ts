import {mergeConfig} from 'vite'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import renewal from './vite.renewal.config.ts'
import {parkGeometryPlugin} from './scripts/parkGeometryPlugin.ts'
const root=fileURLToPath(new URL('.',import.meta.url))
const backend=process.env.PARK_RENEWAL_BACKEND_ORIGIN??'http://127.0.0.1:19186'
export default mergeConfig(renewal,{
 plugins:[parkGeometryPlugin()],
 cacheDir:'.vite-cache/renewal-integration',
 optimizeDeps:{entries:['index.html'],include:['@dimforge/rapier3d-compat']},
 server:{host:'127.0.0.1',port:5390,strictPort:true,proxy:{'/api/v1':{target:backend,changeOrigin:true},'/ws/tables':{target:backend,ws:true}}},
 build:{outDir:'dist-renewal-integration',rollupOptions:{input:path.join(root,'index.html')}},
})
