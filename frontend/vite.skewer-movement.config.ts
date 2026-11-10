import { defineConfig, mergeConfig } from 'vite'
import base from './vite.skewer-vr-greeting.config.ts'

export default mergeConfig(base, defineConfig({
  cacheDir: 'node_modules/.vite-skewer-movement',
  server: { port: 5280 },
  optimizeDeps: { entries: ['tests/skewer-coop/fixtures/movement.html'] },
}))
