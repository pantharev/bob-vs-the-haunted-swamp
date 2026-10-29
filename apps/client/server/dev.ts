import { createApi } from './api';
import { nodeHandler } from './node';
import { MemoryStore, type Store } from './store';
import { upstashFromEnv } from './upstash';

// Survives Vite reloading this module, so dev hiscores last as long as the dev server.
const shared = globalThis as { hiscoresDevStore?: Store };

/**
 * The API inside `vite` dev (see the plugin in vite.config.ts). Uses Upstash
 * when .env.local has its credentials, otherwise an in-memory store.
 */
export function devHandler(env: Record<string, string | undefined>, rules: string) {
  const store = upstashFromEnv(env) ?? (shared.hiscoresDevStore ??= new MemoryStore());
  return nodeHandler(createApi({ store, rules }));
}
