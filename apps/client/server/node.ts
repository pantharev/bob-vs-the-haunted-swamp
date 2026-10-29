import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiRequest, ApiResponse } from './api';

/** Replays are tens of kB; nothing legitimate comes close to this. */
const BODY_LIMIT = 1_000_000;

/** Adapts the API to a Node http handler: a Vercel function, or Vite's dev server middleware. */
export function nodeHandler(api: (req: ApiRequest) => Promise<ApiResponse>) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = url.pathname.split('/').filter(Boolean).pop() ?? '';
    let body: unknown = null;
    if (req.method === 'POST') {
      const text = await readBody(req);
      if (text === null) return send(res, { status: 413, body: { error: 'Too big.' } });
      try {
        body = JSON.parse(text);
      } catch {
        return send(res, { status: 400, body: { error: 'Expected JSON.' } });
      }
    }
    // Vercel sets x-forwarded-for to the client's address.
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    send(res, await api({ method: req.method ?? 'GET', route, query: url.searchParams, body, ip }));
  };
}

function send(res: ServerResponse, { status, body, cacheControl = 'no-store' }: ApiResponse): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', cacheControl);
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        resolve(null);
        req.resume();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
