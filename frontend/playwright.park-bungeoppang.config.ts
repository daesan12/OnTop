import { defineConfig } from '@playwright/test';
import base from './playwright.park.config';

const renewal = process.env.PARK_INTEGRATION_MAP === 'renewal';

export default defineConfig({
  ...base,
  testDir: './tests/park-bungeoppang',
  ...(renewal ? { testMatch: 'bungeoppang.spec.ts', grep: undefined } : {}),
  webServer: { ...base.webServer, env: { VITE_PARK_MAP: 'generated', VITE_BUNGEOPPANG_RULES_VERSION: 'v5' } },
});
