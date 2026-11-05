import { defineConfig } from '@playwright/test'
import base from './playwright.jumpmap-overlap.config'
export default defineConfig({ ...base, testMatch: ['**/fence-movement.spec.ts', '**/jumpmap-overlap.spec.ts'] })
