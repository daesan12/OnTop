import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { parkGeometryPlugin } from './scripts/parkGeometryPlugin.ts'
import { parkBindingsPlugin } from './scripts/parkBindingsPlugin.ts'

export default defineConfig({
  // Linked dependencies may be shared by worktrees; optimizer caches must not be.
  cacheDir: fileURLToPath(new URL('./.vite-cache', import.meta.url)),
  plugins: [react(), parkGeometryPlugin(), parkBindingsPlugin()],
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
