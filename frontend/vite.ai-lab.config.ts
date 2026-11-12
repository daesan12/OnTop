import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  cacheDir: '.vite-cache/ai-lab',
  server: {
    host: '127.0.0.1', port: 5210, strictPort: true,
    proxy: { '/dev/ai': { target: 'http://127.0.0.1:19190', changeOrigin: true, ws: true } },
  },
  build: { outDir: 'dist-ai-lab', rollupOptions: { input: 'ai-lab.html' } },
})
