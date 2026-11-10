import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {parkBindingsPlugin} from './scripts/parkBindingsPlugin.ts'

const root=fileURLToPath(new URL('.',import.meta.url))
// The reviewed asset closure is versioned with the application, including local previews.
export default defineConfig({
 plugins:[react(),parkBindingsPlugin()],
 resolve:{dedupe:['three','react','react-dom','@react-three/fiber']},
 cacheDir:'.vite-cache/renewal',optimizeDeps:{entries:['park-renewal.html']},
 server:{host:'127.0.0.1',port:5389,strictPort:true,hmr:false,fs:{allow:[root]}},
 build:{outDir:'dist-renewal',rollupOptions:{input:path.join(root,'park-renewal.html')}}
})
