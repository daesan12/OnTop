import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { parkMapGenerationPlugin } from './scripts/park-map-vite-plugin.ts'
import { parkGeometryPlugin } from './scripts/parkGeometryPlugin.ts'
import { parkBindingsPlugin } from './scripts/parkBindingsPlugin.ts'

export default defineConfig(({mode})=>({
  // Prepare the lazy prediction dependency before joining; first movement must not reload the dev page.
  optimizeDeps: { include: ['@dimforge/rapier3d-compat'] },
  // Preview and service review run together; keep their dependency URLs independent.
  cacheDir:mode==='park-integration'?'node_modules/.vite-park-integration':undefined,
  define:mode==='park-integration'?{'import.meta.env.VITE_PARK_MAP':JSON.stringify('generated')}:undefined,
  plugins: [react(),parkMapGenerationPlugin(),parkGeometryPlugin(),parkBindingsPlugin()],
  server: {
    proxy: {
      '/ws/tables': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8080', ws: true },
      '/api/v1': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
}))
