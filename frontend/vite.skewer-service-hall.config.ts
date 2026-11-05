import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  cacheDir: 'node_modules/.vite-skewer-service-hall',
  plugins: [react()], server: { host: '127.0.0.1', port: 5238, strictPort: true },
  optimizeDeps: { entries: ['skewer-service-hall.html'] },
  build: { outDir: 'dist-skewer-service-hall', rollupOptions: { input: fileURLToPath(new URL('./skewer-service-hall.html', import.meta.url)) } },
})
