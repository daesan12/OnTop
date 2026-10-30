import { defineConfig } from '@playwright/test'
import park from './playwright.park.config'

/** Run the existing history and chair contracts against the actual generated-map scene. */
export default defineConfig({
  ...park,
  testDir: './tests/e2e',
  testMatch: ['**/game-history.spec.ts', '**/public-chairs.spec.ts'],
  metadata: { generatedPark: true },
})
