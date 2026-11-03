import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  cacheDir: 'node_modules/.vite-skewer-chef',
  plugins: [react()], server: { host: '127.0.0.1', port: 5240, strictPort: true },
  optimizeDeps: { entries: ['skewer-chef.html'] },
  build: { outDir: 'dist-skewer-chef', rollupOptions: { input: fileURLToPath(new URL('./skewer-chef.html', import.meta.url)) } },
})
