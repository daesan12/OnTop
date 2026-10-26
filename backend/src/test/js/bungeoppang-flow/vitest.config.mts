import { fileURLToPath } from 'node:url'

export default {
  resolve: { alias: { vitest: fileURLToPath(new URL('../../../../../frontend/node_modules/vitest/dist/index.js', import.meta.url)) } },
  test: {
    environment: 'node', include: ['src/test/js/bungeoppang-flow/flow.test.ts'],
    maxWorkers: 1, fileParallelism: false, testTimeout: 110000,
  },
}
