import { defineConfig } from 'vite';
import { rulesVersion } from './scripts/rules-version.ts';

/**
 * Bundles the hiscores API (server/vercel.ts) into one self-contained file,
 * sim and all, for scripts/vercel-output.mjs to deploy as Vercel functions.
 */
export default defineConfig({
  define: { __RULES__: JSON.stringify(rulesVersion()) },
  // The game's public/ files are for the static site, not the function.
  publicDir: false,
  build: {
    ssr: 'server/vercel.ts',
    outDir: '.vercel/api',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { output: { format: 'es', entryFileNames: 'index.mjs' } },
  },
  ssr: { noExternal: true, target: 'node' },
});
