import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Normally injected by apps/client/vite.config.ts.
  define: { __RULES__: JSON.stringify('test') },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
  },
});
