import { Redis } from '@upstash/redis';
import { detailsKey, type BoardRecord, type BoardRow, type Placing, type Store } from './store';

/**
 * Store on Upstash Redis. Reads the REST credentials Vercel's Upstash
 * integration adds (KV_REST_API_*), or Upstash's own names. Returns null
 * when neither is set, and the API then answers 503.
 */
export function upstashFromEnv(env: Record<string, string | undefined>): Store | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  // Raw strings in and out: we store our own JSON.
  return new UpstashStore(
    new Redis({ url, token, automaticDeserialization: false, enableTelemetry: false }),
  );
}

export class UpstashStore implements Store {
  constructor(private readonly redis: Redis) {}

  async put(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }

  async take(key: string): Promise<string | null> {
    return this.redis.getdel<string>(key);
  }

  async count(key: string, ttlSeconds: number): Promise<number> {
    const [hits] = await this.redis
      .pipeline()
      .incr(key)
      .expire(key, ttlSeconds, 'NX')
      .exec<[number, number]>();
    return Number(hits);
  }

  async record(board: string, entry: BoardRecord, ttlSeconds: number | null): Promise<Placing> {
    const { member, score, details } = entry;
    // GT: only ever raise a player's best. CH: report whether it changed.
    const changed = await this.redis.zadd(board, { gt: true, ch: true }, { score, member });
    const write = this.redis.pipeline();
    if (changed) write.hset(detailsKey(board), { [member]: details });
    if (ttlSeconds !== null) write.expire(board, ttlSeconds).expire(detailsKey(board), ttlSeconds);
    write.zrevrank(board, member).zscore(board, member);
    const results = await write.exec<unknown[]>();
    const [rank, best] = results.slice(-2);
    return { improved: Boolean(changed), rank: Number(rank), best: Number(best) };
  }

  async top(board: string, count: number): Promise<BoardRow[]> {
    const flat = await this.redis.zrange<string[]>(board, 0, count - 1, {
      rev: true,
      withScores: true,
    });
    const rows: { member: string; score: number }[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2)
      rows.push({ member: flat[i]!, score: Number(flat[i + 1]) });
    if (rows.length === 0) return [];
    // With automaticDeserialization off this is HMGET's raw reply: values in field order.
    const raw: unknown = await this.redis.hmget(detailsKey(board), ...rows.map((r) => r.member));
    const details = (i: number, member: string): string | null =>
      Array.isArray(raw)
        ? (raw[i] ?? null)
        : ((raw as Record<string, string | null> | null)?.[member] ?? null);
    return rows.map((r, rank) => ({ ...r, rank, details: details(rank, r.member) }));
  }

  async find(board: string, member: string): Promise<BoardRow | null> {
    const [rank, score, details] = await this.redis
      .pipeline()
      .zrevrank(board, member)
      .zscore(board, member)
      .hget<string>(detailsKey(board), member)
      .exec<[number | null, number | string | null, string | null]>();
    if (rank === null || score === null) return null;
    return { member, rank: Number(rank), score: Number(score), details };
  }
}
