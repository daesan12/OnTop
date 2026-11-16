import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { parkBindingsPlugin } from './scripts/parkBindingsPlugin.ts'

export default defineConfig({
  mode: 'park-renewal-integration',
  plugins: [react(), parkBindingsPlugin()],
  cacheDir: '.vite-cache/balloon-preview',
  optimizeDeps: { entries: ['balloon-preview.html'], include: ['@dimforge/rapier3d-compat'] },
  server: { host: '127.0.0.1', port: 5226, strictPort: true },
})
