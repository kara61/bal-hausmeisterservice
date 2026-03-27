import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    exclude: ['**/node_modules/**', 'tests/e2e/**'],
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'api/_handlers/**'],
      exclude: ['**/node_modules/**', 'tests/**'],
    },
  },
});
