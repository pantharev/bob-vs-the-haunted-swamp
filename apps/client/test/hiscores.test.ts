import { ZONES, type WeaponId } from '@game/content';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { recordBot } from '../../../packages/sim/test/bot';
import { createApi, isoWeek, type ApiRequest } from '../server/api';
import { nodeHandler } from '../server/node';
import { MemoryStore } from '../server/store';
import type {
  BoardResponse,
  RunSubmission,
  SubmitResponse,
  TicketResponse,
} from '../src/hiscores/protocol';

const RULES = 'test-rules';
const PLAYER = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);
const MINUTE = 60_000;

/** An API on a MemoryStore with a clock the test moves by hand. */
function setup() {
  const clock = { now: Date.UTC(2026, 9, 28, 12) };
  const now = () => clock.now;
  const logs: string[] = [];
  const api = createApi({
    store: new MemoryStore(now),
    rules: RULES,
    now,
    log: (m) => logs.push(m),
  });
  const call = (method: string, route: string, body: unknown = null, query = '') =>
    api({
      method,
      route,
      body,
      query: new URLSearchParams(query),
      ip: '1.2.3.4',
    } satisfies ApiRequest);
  const ticket = async (player = PLAYER) =>
    (await call('POST', 'ticket', { player })).body as TicketResponse;
  return { clock, logs, call, ticket };
}

type Api = ReturnType<typeof setup>;

/** Takes a ticket, plays a bot run on its seed, waits as long as the run took, and builds the submission. */
async function play(api: Api, weapon: WeaponId = 'dagger', player = PLAYER) {
  const { ticket, seed } = await api.ticket(player);
  const { world, replay } = recordBot(seed, ZONES.wolfmoor, weapon);
  api.clock.now += (world.stats.timeTicks / 60) * 1000 + MINUTE;
  const run: RunSubmission = {
    ticket,
    player,
    name: 'Bob',
    rules: RULES,
    score: world.stats.score,
    replay,
  };
  return { world, run };
}

describe('hiscores api', () => {
  it('hands out a ticket with a seed', async () => {
    const api = setup();
    const res = await api.call('POST', 'ticket', { player: PLAYER });
    expect(res.status).toBe(200);
    const body = res.body as TicketResponse;
    expect(body.ticket).toMatch(/^[0-9a-f]{32}$/);
    expect(Number.isInteger(body.seed)).toBe(true);
    expect((await api.call('POST', 'ticket', { player: 'nope' })).status).toBe(400);
    expect((await api.call('GET', 'ticket')).status).toBe(405);
  });

  it('records a replayed run on the weekly and all-time boards', async () => {
    const api = setup();
    const { world, run } = await play(api);
    const res = await api.call('POST', 'runs', { ...run, name: '  Bob   the  Bold ' });
    expect(res.status).toBe(200);
    const body = res.body as SubmitResponse;
    expect(body.score).toBe(world.stats.score);
    expect(body.boards.week).toEqual({ rank: 1, best: world.stats.score, improved: true });
    expect(body.boards.all).toEqual({ rank: 1, best: world.stats.score, improved: true });

    for (const board of ['week', 'all']) {
      const list = (await api.call('GET', 'hiscores', null, `board=${board}&player=${PLAYER}`))
        .body as BoardResponse;
      expect(list.entries).toHaveLength(1);
      expect(list.entries[0]).toMatchObject({
        rank: 1,
        name: 'Bob the Bold',
        score: world.stats.score,
        wave: world.wave,
        won: world.outcome === 'victory',
        weapon: 'dagger',
        kills: world.stats.kills,
      });
      expect(list.you).toEqual(list.entries[0]);
    }
  }, 30_000);

  it('keeps each player best score and ranks players', async () => {
    const api = setup();
    const first = await play(api, 'staff');
    await api.call('POST', 'runs', first.run);
    const second = await play(api, 'dagger');
    const worse = (await api.call('POST', 'runs', second.run)).body as SubmitResponse;
    const [low, high] = [second.world.stats.score, first.world.stats.score].sort((a, b) => a - b);
    // Whichever run scored higher stays as the player's best.
    expect(worse.boards.all.best).toBe(high);
    expect(worse.boards.all.improved).toBe(second.world.stats.score === high && low !== high);

    const other = await play(api, 'shortbow', OTHER);
    const placed = (await api.call('POST', 'runs', other.run)).body as SubmitResponse;
    expect(placed.boards.all.rank).toBe(other.world.stats.score > high ? 1 : 2);
    const list = (await api.call('GET', 'hiscores', null, 'board=all')).body as BoardResponse;
    expect(list.entries.map((e) => e.rank)).toEqual([1, 2]);
    expect(list.entries[0]!.score).toBeGreaterThanOrEqual(list.entries[1]!.score);
    expect(list.you).toBeNull();
  }, 60_000);

  it('starts a new weekly board each week but keeps all-time', async () => {
    const api = setup();
    await api.call('POST', 'runs', (await play(api)).run);
    api.clock.now += 7 * 24 * 60 * MINUTE;
    const week = (await api.call('GET', 'hiscores', null, 'board=week')).body as BoardResponse;
    const all = (await api.call('GET', 'hiscores', null, 'board=all')).body as BoardResponse;
    expect(week.entries).toHaveLength(0);
    expect(all.entries).toHaveLength(1);
  }, 30_000);

  describe('turns away', () => {
    it('a reused ticket', async () => {
      const api = setup();
      const { run } = await play(api);
      expect((await api.call('POST', 'runs', run)).status).toBe(200);
      expect((await api.call('POST', 'runs', run)).status).toBe(410);
    }, 30_000);

    it("someone else's ticket", async () => {
      const api = setup();
      const { run } = await play(api);
      expect((await api.call('POST', 'runs', { ...run, player: OTHER })).status).toBe(403);
    }, 30_000);

    it('a claimed score the replay does not produce', async () => {
      const api = setup();
      const { run } = await play(api);
      const res = await api.call('POST', 'runs', { ...run, score: run.score + 1000 });
      expect(res.status).toBe(422);
      expect(api.logs.join()).toMatch(/score mismatch/);
    }, 30_000);

    it('a replay on a different seed', async () => {
      const api = setup();
      const { run } = await play(api);
      const res = await api.call('POST', 'runs', {
        ...run,
        replay: { ...run.replay, seed: run.replay.seed ^ 1 },
      });
      expect(res.status).toBe(422);
    }, 30_000);

    it('a broken replay', async () => {
      const api = setup();
      const { run } = await play(api);
      const res = await api.call('POST', 'runs', {
        ...run,
        replay: { ...run.replay, moves: 'AAAA' },
      });
      expect(res.status).toBe(422);
      expect((res.body as { error: string }).error).toMatch(/didn't check out/);
    }, 30_000);

    it('a run posted faster than it could be played', async () => {
      const api = setup();
      const { ticket, seed } = await api.ticket();
      const { world, replay } = recordBot(seed, ZONES.wolfmoor, 'dagger');
      const run = {
        ticket,
        player: PLAYER,
        name: 'Bob',
        rules: RULES,
        score: world.stats.score,
        replay,
      };
      expect((await api.call('POST', 'runs', run)).status).toBe(422);
    }, 30_000);

    it('runs from other rules', async () => {
      const api = setup();
      const { run } = await play(api);
      expect((await api.call('POST', 'runs', { ...run, rules: 'old' })).status).toBe(409);
    }, 30_000);

    it.each(['', '   ', 'x'.repeat(17), 'Bob!', 'a<b>', 'pumpkin🎃'])(
      'the name %j',
      async (name) => {
        const api = setup();
        const res = await api.call('POST', 'runs', {
          ticket: 'c'.repeat(32),
          player: PLAYER,
          name,
          rules: RULES,
          score: 0,
          replay: {},
        });
        expect(res.status).toBe(400);
      },
    );

    it('a flood of runs from one address', async () => {
      const api = setup();
      const bogus = {
        ticket: 'c'.repeat(32),
        player: PLAYER,
        name: 'Bob',
        rules: RULES,
        score: 0,
        replay: {},
      };
      const statuses = [];
      for (let i = 0; i < 11; i++) statuses.push((await api.call('POST', 'runs', bogus)).status);
      expect(statuses.slice(0, 10).every((s) => s === 410)).toBe(true);
      expect(statuses[10]).toBe(429);
      // A minute later the address can post again.
      api.clock.now += MINUTE;
      expect((await api.call('POST', 'runs', bogus)).status).toBe(410);
    });
  });

  it('answers 503 until a store is configured', async () => {
    const api = createApi({ store: null, rules: RULES });
    const res = await api({
      method: 'GET',
      route: 'hiscores',
      body: null,
      query: new URLSearchParams(),
      ip: 'x',
    });
    expect(res.status).toBe(503);
  });

  it('names ISO weeks', () => {
    expect(isoWeek(Date.UTC(2026, 9, 28))).toBe('2026-W44');
    expect(isoWeek(Date.UTC(2021, 0, 1))).toBe('2020-W53');
    expect(isoWeek(Date.UTC(2024, 11, 30))).toBe('2025-W01');
    // Weeks start on Monday.
    expect(isoWeek(Date.UTC(2026, 10, 1, 23, 59))).toBe('2026-W44');
    expect(isoWeek(Date.UTC(2026, 10, 2))).toBe('2026-W45');
  });
});

describe('node adapter', () => {
  it('routes by the last path segment and parses JSON bodies', async () => {
    const store = new MemoryStore();
    const server = createServer(nodeHandler(createApi({ store, rules: RULES })));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const ticket = await fetch(`${base}/api/ticket`, {
        method: 'POST',
        body: JSON.stringify({ player: PLAYER }),
      });
      expect(ticket.status).toBe(200);
      expect(ticket.headers.get('cache-control')).toBe('no-store');
      const broken = await fetch(`${base}/api/runs`, { method: 'POST', body: '{nope' });
      expect(broken.status).toBe(400);
      const list = await fetch(`${base}/api/hiscores?board=all`);
      expect(list.status).toBe(200);
      expect(list.headers.get('cache-control')).toMatch(/s-maxage/);
      expect(await list.json()).toEqual({ board: 'all', entries: [], you: null });
    } finally {
      server.close();
    }
  });
});
