import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config'

export default defineConfig(async env => mergeConfig(await (typeof base === 'function' ? base(env) : base), {
  define: { 'import.meta.env.VITE_PARK_MAP': JSON.stringify('generated'), 'import.meta.env.VITE_SKEWER_COOP_ENABLED': JSON.stringify('true') },
  server: { host: '127.0.0.1', port: 5244, strictPort: true, proxy: { '/ws/tables': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:19185', ws: true }, '/api/v1': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:19185', changeOrigin: true }, '/local': { target: 'http://127.0.0.1:19185' } } },
  build: { outDir: 'dist-skewer-coop' },
}))
