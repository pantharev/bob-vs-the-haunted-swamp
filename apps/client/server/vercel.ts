import { upstashFromEnv } from '@game/hiscores/upstash';
import { createApi } from './api';
import { nodeHandler } from './node';

/**
 * The Vercel function. vite.api.config.ts bundles this into one file, and
 * scripts/vercel-output.mjs deploys it as /api/ticket, /api/runs and /api/hiscores.
 */
export default nodeHandler(createApi({ store: upstashFromEnv(process.env), rules: __RULES__ }));
