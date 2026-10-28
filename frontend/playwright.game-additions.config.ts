import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import base from './playwright.onecard.config'

// Proposed BE contracts are opt-in and verified with explicit local fixtures.
export default defineConfig({
  ...base,
  testMatch: ['onecard-defense.spec.ts', 'bungeoppang-ranking.spec.ts'],
  outputDir: path.join(os.tmpdir(), 'ontop-game-additions-e2e'),
  webServer: { ...base.webServer, env: { VITE_TABLET_LOBBY: 'false', VITE_ONECARD_PRANKS: 'true',
    VITE_ONECARD_PRANK_DEFENSE: 'true', VITE_BUNGEOPPANG_RANKINGS: 'true' } },
})
