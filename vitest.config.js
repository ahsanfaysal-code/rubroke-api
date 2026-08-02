import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // SQLite is single-writer: run tests serially to avoid lock contention.
    pool: 'forks',
    fileParallelism: false,
    include: ['tests/**/*.test.js'],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
