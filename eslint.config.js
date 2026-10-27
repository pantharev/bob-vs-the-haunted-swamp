import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/dist/**', '**/node_modules/**', 'art/**', 'generated-images/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/client/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tools/**/*.mjs', '*.config.{js,ts}', 'apps/*/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // The sim must be reproducible from seed + inputs, and must run headless on a server.
    files: ['packages/sim/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng (determinism).' },
        { object: 'Date', property: 'now', message: 'The sim must not read the wall clock.' },
        { object: 'performance', property: 'now', message: 'The sim must not read the wall clock.' },
      ],
    },
  },
]);
