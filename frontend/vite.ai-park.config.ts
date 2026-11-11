import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config.ts'
export default defineConfig(async () => mergeConfig(await base({mode:'park-integration',command:'serve',isPreview:false}),{
  mode:'park-integration',
  define:{'import.meta.env.VITE_PARK_MAP':JSON.stringify('generated'),'import.meta.env.VITE_AI_PARK':JSON.stringify('true')},
  server:{host:'127.0.0.1',port:5211,strictPort:true,proxy:{
    '/local/ai':{target:'http://127.0.0.1:19191'},
    '/dev/alkkagi-park':{target:'http://127.0.0.1:19191'},
    '/api/v1':{target:'http://127.0.0.1:19191',changeOrigin:true},
    '/ws/tables':{target:'http://127.0.0.1:19191',ws:true}
  }}
}))
