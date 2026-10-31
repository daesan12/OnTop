import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Explicit local entry: no park-map generation, authentication or API proxy.
export default defineConfig({
  plugins: [react(), {
    name: 'local-skewer-entry',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === '/' || request.url === '/index.html') {
          response.writeHead(302, { Location: '/vr-zone.html' })
          response.end()
        } else next()
      })
    },
  }],
  optimizeDeps: { entries: ['skewer.html', 'vr-zone.html'] },
  server: {
    host: '127.0.0.1',
    port: 5187,
    strictPort: true,
    headers: { 'Permissions-Policy': 'xr-spatial-tracking=(self)' },
  },
  build: {
    outDir: 'dist-skewer',
    rollupOptions: { input: { skewer: fileURLToPath(new URL('./skewer.html', import.meta.url)), vrZone: fileURLToPath(new URL('./vr-zone.html', import.meta.url)) } },
  },
})
