import { defineConfig } from 'vitest/config'
import { parkBindingsPlugin } from './scripts/parkBindingsPlugin.ts'
export default defineConfig({
  plugins: [parkBindingsPlugin()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
})
