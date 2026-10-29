import { createApi } from './api';
import { nodeHandler } from './node';
import { upstashFromEnv } from './upstash';

/**
 * The Vercel function. vite.api.config.ts bundles this into one file, and
 * scripts/vercel-output.mjs deploys it as /api/ticket, /api/runs and /api/hiscores.
 */
export default nodeHandler(createApi({ store: upstashFromEnv(), rules: __RULES__ }));
