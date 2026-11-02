import { defineConfig } from '@playwright/test';
import base from './playwright.park.config';

// Exercise the existing opt-in game on the generated map, without changing service defaults.
export default defineConfig({
  ...base,
  testDir: './tests/park-bungeoppang',
  webServer: { ...base.webServer, env: { VITE_BUNGEOPPANG_RULES_VERSION: 'v5' } },
});
