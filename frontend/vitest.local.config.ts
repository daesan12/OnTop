import { defineConfig } from 'vitest/config'
import unitConfig from './vitest.config.ts'

export default defineConfig({
  ...unitConfig,
  test: { ...unitConfig.test, include: ['tests/local-unit/**/*.test.ts'] },
})
