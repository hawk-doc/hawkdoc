import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The API is thin over PostgreSQL and Redis, so these are integration
    // tests: they need both running (docker compose up -d) and a schema
    // applied. See CONTRIBUTING.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    // Each file gets its own user and documents, but they share a database
    fileParallelism: false,
    // Without this a spy in one test leaks into the next
    restoreMocks: true,
    testTimeout: 15_000,
    hookTimeout: 20_000,
  },
});
