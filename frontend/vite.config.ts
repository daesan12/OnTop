import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { parkMapGenerationPlugin } from './scripts/park-map-vite-plugin.ts'

export default defineConfig({
  plugins: [react(),parkMapGenerationPlugin()],
  server: {
    proxy: {
      '/ws/tables': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8080', ws: true },
      '/api/v1': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})
