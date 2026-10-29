import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import base from './playwright.onecard.config'

// Exercise normal default-on features through explicit local contract fixtures.
export default defineConfig({
  ...base,
  testMatch: ['onecard-defense.spec.ts', 'bungeoppang-ranking.spec.ts'],
  outputDir: path.join(os.tmpdir(), 'ontop-game-additions-e2e'),
  webServer: { ...base.webServer, env: { VITE_TABLET_LOBBY: 'false', VITE_BUNGEOPPANG_RULES_VERSION: 'v4' } },
})
