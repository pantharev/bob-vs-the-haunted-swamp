// Assembles .vercel/output (Vercel's Build Output API v3) from the Vite build in dist/
// and the bundled API in .vercel/api/. When a build leaves this folder behind,
// Vercel deploys it as-is: the game as static files plus one function per API route.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const client = fileURLToPath(new URL('..', import.meta.url));
const out = `${client}.vercel/output`;
const ROUTES = ['ticket', 'runs', 'hiscores'];

rmSync(out, { recursive: true, force: true });
cpSync(`${client}dist`, `${out}/static`, { recursive: true });

for (const route of ROUTES) {
  const dir = `${out}/functions/api/${route}.func`;
  mkdirSync(dir, { recursive: true });
  cpSync(`${client}.vercel/api/index.mjs`, `${dir}/index.mjs`);
  writeJson(`${dir}/package.json`, { type: 'module' });
  writeJson(`${dir}/.vc-config.json`, {
    runtime: 'nodejs22.x',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    shouldAddHelpers: false,
    // A full replay takes about a second; leave plenty of room on a cold start.
    maxDuration: 30,
  });
}

writeJson(`${out}/config.json`, {
  version: 3,
  routes: [
    // Vite puts a content hash in every file name under assets/, so they never change.
    {
      src: '^/assets/(.*)$',
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    { handle: 'filesystem' },
  ],
});

console.log(`vercel output: static site + /api/{${ROUTES.join(',')}}`);

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
