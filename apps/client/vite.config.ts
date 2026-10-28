import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  build: { target: 'es2022', sourcemap: true },
  // Menus are Preact (PLAN.md §5); the automatic runtime needs no imports in .tsx files.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
});
