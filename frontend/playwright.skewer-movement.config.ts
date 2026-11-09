import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import base from './playwright.skewer-vr-greeting.config.ts'

export default defineConfig({ ...base,
  testMatch: ['movement.spec.ts', 'render-budget.spec.ts', 'serving-performance.spec.ts', 'feedback.spec.ts', 'greeting-turn.spec.ts', 'pause.spec.ts', 'restart-modal.spec.ts'],
  outputDir: path.join(os.tmpdir(), 'ontop-skewer-movement-results'),
  use: { ...base.use, baseURL: 'http://127.0.0.1:5280' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --config vite.skewer-movement.config.ts',
    url: 'http://127.0.0.1:5280/tests/skewer-coop/fixtures/movement.html', reuseExistingServer: false },
})
