import { defineConfig } from 'vitest/config';

/**
 * Coverage is measured over unit AND integration tests together: the posting
 * engine's I/O shell is only exercised against a real Postgres, and CLAUDE.md
 * §6 asks for 100% branch coverage of this package with no exceptions.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
