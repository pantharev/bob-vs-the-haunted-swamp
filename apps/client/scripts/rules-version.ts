import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SOURCES = ['packages/sim/src', 'packages/content/src'];

/**
 * A short hash of the sim and content sources. A replay only re-runs the same
 * way on the same rules, so the client sends this with each run and the API
 * (built from the same sources) turns away runs from any other version.
 */
export function rulesVersion(): string {
  const hash = createHash('sha256');
  for (const file of SOURCES.flatMap((dir) => listFiles(join(ROOT, dir))).sort()) {
    hash.update(relative(ROOT, file).replaceAll('\\', '/'));
    // Line endings depend on the checkout (Windows vs. Vercel's Linux), not on the rules.
    hash.update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n'));
  }
  return hash.digest('hex').slice(0, 12);
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
  });
}
