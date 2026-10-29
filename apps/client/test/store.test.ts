import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryStore, type Store } from '../server/store';
import { upstashFromEnv } from '../server/upstash';
import { startFakeUpstash } from './fake-upstash';

let fake: Awaited<ReturnType<typeof startFakeUpstash>>;
beforeAll(async () => {
  fake = await startFakeUpstash();
});
afterAll(() => fake.close());

const stores: [string, () => Store][] = [
  ['MemoryStore', () => new MemoryStore()],
  [
    'UpstashStore',
    () => upstashFromEnv({ KV_REST_API_URL: fake.url, KV_REST_API_TOKEN: 'token' })!,
  ],
];

// The same contract for both, so dev and tests (MemoryStore) behave like production (Upstash).
describe.each(stores)('%s', (_, make) => {
  // Fresh keys per test: the fake server is shared.
  let n = 0;
  const key = (name: string) => `${name}:${++n}:${Math.random()}`;

  it('reads a put value once', async () => {
    const store = make();
    const k = key('ticket');
    await store.put(k, '{"seed":1}', 60);
    expect(await store.take(k)).toBe('{"seed":1}');
    expect(await store.take(k)).toBeNull();
  });

  it('counts hits', async () => {
    const store = make();
    const k = key('rate');
    expect(await store.count(k, 60)).toBe(1);
    expect(await store.count(k, 60)).toBe(2);
  });

  it("keeps each member's best and ranks them", async () => {
    const store = make();
    const board = key('board');
    expect(await store.record(board, { member: 'p1', score: 100, details: '"a"' }, null)).toEqual({
      improved: true,
      rank: 0,
      best: 100,
    });
    expect(await store.record(board, { member: 'p2', score: 300, details: '"b"' }, 3600)).toEqual({
      improved: true,
      rank: 0,
      best: 300,
    });
    // A worse run changes nothing.
    expect(await store.record(board, { member: 'p1', score: 50, details: '"c"' }, null)).toEqual({
      improved: false,
      rank: 1,
      best: 100,
    });
    expect(await store.record(board, { member: 'p1', score: 400, details: '"d"' }, null)).toEqual({
      improved: true,
      rank: 0,
      best: 400,
    });
    expect(await store.top(board, 10)).toEqual([
      { member: 'p1', rank: 0, score: 400, details: '"d"' },
      { member: 'p2', rank: 1, score: 300, details: '"b"' },
    ]);
    expect(await store.top(board, 1)).toHaveLength(1);
    expect(await store.find(board, 'p2')).toEqual({
      member: 'p2',
      rank: 1,
      score: 300,
      details: '"b"',
    });
    expect(await store.find(board, 'nobody')).toBeNull();
    expect(await store.top(key('empty'), 10)).toEqual([]);
  });
});

it('sends Upstash the options that keep a best score (GT, CH)', () => {
  const zadd = fake.commands.find(([name]) => name === 'zadd')!;
  expect(zadd.slice(2, 4).sort()).toEqual(['ch', 'gt']);
});
