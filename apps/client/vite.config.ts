import { defineConfig, loadEnv, type Plugin } from 'vite';
import { rulesVersion } from './scripts/rules-version.ts';

const rules = rulesVersion();

export default defineConfig({
  server: { port: 5173 },
  build: { target: 'es2022', sourcemap: true },
  define: { __RULES__: JSON.stringify(rules) },
  // Menus are Preact (PLAN.md §5); the automatic runtime needs no imports in .tsx files.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  plugins: [hiscoresApi()],
});

/** Serves /api/* from server/ during `vite` dev, the same handlers Vercel runs. */
function hiscoresApi(): Plugin {
  return {
    name: 'hiscores-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '');
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        server
          .ssrLoadModule('/server/dev.ts')
          .then(({ devHandler }) => devHandler(env, rules)(req, res))
          .catch(next);
      });
    },
  };
}
