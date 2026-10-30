import { defineConfig } from 'vite';
import { rulesVersion } from '../client/scripts/rules-version.ts';

/**
 * Bundles the co-op server into dist/server.mjs. The workspace packages
 * (TypeScript source) are bundled in; npm packages like socket.io stay
 * external and load from node_modules.
 */
export default defineConfig({
  // Browsers and this server must run the same rules (Rooms turns other versions away).
  define: { __RULES__: JSON.stringify(rulesVersion()) },
  publicDir: false,
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { output: { format: 'es', entryFileNames: 'server.mjs' } },
  },
  ssr: { noExternal: [/^@game\//], target: 'node' },
});
