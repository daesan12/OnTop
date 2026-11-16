import { defineConfig, mergeConfig } from 'vite'
import park from './vite.config.ts'

export default defineConfig(env => mergeConfig(park(env), {
  define: { 'import.meta.env.VITE_STONE_RUMBLE_ENABLED': JSON.stringify('true') },
  server: {
    host: '127.0.0.1', port: 5501, strictPort: true,
    proxy: {
      '/dev/stone-rumble-park': 'http://127.0.0.1:19191',
      '/api/v1': { target: 'http://127.0.0.1:19191', changeOrigin: true },
      '/ws/tables': { target: 'http://127.0.0.1:19191', ws: true },
    },
  },
}))
