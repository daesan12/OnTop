import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config.ts'
export default defineConfig(async () => mergeConfig(await base({mode:'frontend-test',command:'serve',isPreview:false}),{
  define:{'import.meta.env.VITE_ALKKAGI_ENABLED':JSON.stringify('true')},
  server:{host:'127.0.0.1',port:5207,strictPort:true,proxy:{'/dev/alkkagi-park':{target:'http://127.0.0.1:19184'},'/api/v1':{target:'http://127.0.0.1:19184',changeOrigin:true},'/ws/tables':{target:'http://127.0.0.1:19184',ws:true}}}
}))
