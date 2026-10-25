import { fileURLToPath } from 'node:url'

// Use the repository's installed frontend runtime without adding a second package/lockfile.
export default {
  resolve: { alias: { vitest: fileURLToPath(new URL('../../../../../frontend/node_modules/vitest/dist/index.js', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/test/js/minigame-frontend/flow.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 15000,
  },
}
