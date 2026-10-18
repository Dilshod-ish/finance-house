import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.integration.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
