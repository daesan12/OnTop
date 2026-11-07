import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  cacheDir: 'node_modules/.vite-skewer-vr-greeting',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5272, strictPort: true },
  optimizeDeps: { entries: ['skewer-chef.html', 'skewer-service-hall.html', 'tests/skewer-coop/fixtures/restart-modal.html', 'tests/skewer-coop/fixtures/greeting-turn.html', 'tests/skewer-coop/fixtures/play-feedback.html', 'tests/skewer-coop/fixtures/vr-pause.html'] },
})
