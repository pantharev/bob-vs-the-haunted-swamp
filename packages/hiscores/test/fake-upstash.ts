import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Just enough of Upstash's REST API (POST / and POST /pipeline, Redis replies
 * as raw JSON) to run the commands src/upstash.ts sends, with Redis's own
 * reply shapes: scores come back as strings, missing values as null.
 */
export async function startFakeUpstash(): Promise<{
  url: string;
  commands: string[][];
  close: () => void;
}> {
  const strings = new Map<string, string>();
  const zsets = new Map<string, Map<string, number>>();
  const hashes = new Map<string, Map<string, string>>();
  const commands: string[][] = [];

  const ranked = (key: string) =>
    [...(zsets.get(key) ?? [])].sort(([a, x], [b, y]) => y - x || (a < b ? 1 : a > b ? -1 : 0));

  function run(raw: unknown[]): unknown {
    const [name, ...args] = raw.map(String);
    commands.push([name!.toLowerCase(), ...args]);
    const key = args[0]!;
    switch (name!.toLowerCase()) {
      case 'set':
        strings.set(key, args[1]!);
        return 'OK';
      case 'getdel': {
        const value = strings.get(key) ?? null;
        strings.delete(key);
        return value;
      }
      case 'incr': {
        const next = Number(strings.get(key) ?? 0) + 1;
        strings.set(key, String(next));
        return next;
      }
      case 'expire':
        return strings.has(key) || zsets.has(key) || hashes.has(key) ? 1 : 0;
      case 'zadd': {
        const flags = new Set<string>();
        let i = 1;
        while (['nx', 'xx', 'gt', 'lt', 'ch', 'incr'].includes(args[i]!.toLowerCase()))
          flags.add(args[i++]!.toLowerCase());
        const set = zsets.get(key) ?? new Map<string, number>();
        zsets.set(key, set);
        let added = 0;
        let changed = 0;
        for (; i < args.length; i += 2) {
          const score = Number(args[i]);
          const member = args[i + 1]!;
          const old = set.get(member);
          if (old === undefined) {
            set.set(member, score);
            added++;
          } else if ((!flags.has('gt') || score > old) && score !== old) {
            set.set(member, score);
            changed++;
          }
        }
        return flags.has('ch') ? added + changed : added;
      }
      case 'zrevrank': {
        const i = ranked(key).findIndex(([member]) => member === args[1]);
        return i < 0 ? null : i;
      }
      case 'zscore': {
        const score = zsets.get(key)?.get(args[1]!);
        return score === undefined ? null : String(score);
      }
      case 'zrange': {
        const [start, stop] = [Number(args[1]), Number(args[2])];
        const options = args.slice(3).map((a) => a.toLowerCase());
        if (!options.includes('rev')) throw new Error('fake only does REV');
        const rows = ranked(key).slice(start, stop + 1);
        return options.includes('withscores')
          ? rows.flatMap(([m, s]) => [m, String(s)])
          : rows.map(([m]) => m);
      }
      case 'hset': {
        const hash = hashes.get(key) ?? new Map<string, string>();
        hashes.set(key, hash);
        let added = 0;
        for (let i = 1; i < args.length; i += 2) {
          if (!hash.has(args[i]!)) added++;
          hash.set(args[i]!, args[i + 1]!);
        }
        return added;
      }
      case 'hget':
        return hashes.get(key)?.get(args[1]!) ?? null;
      case 'hmget':
        return args.slice(1).map((field) => hashes.get(key)?.get(field) ?? null);
      default:
        throw new Error(`fake upstash: unsupported command ${name}`);
    }
  }

  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      try {
        const parsed = JSON.parse(body) as unknown[];
        const reply = req.url?.startsWith('/pipeline')
          ? (parsed as unknown[][]).map((cmd) => ({ result: run(cmd) }))
          : { result: run(parsed) };
        res.end(JSON.stringify(reply));
      } catch (error) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: String(error) }));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, commands, close: () => server.close() };
}
