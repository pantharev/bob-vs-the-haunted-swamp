import { ZONES, type ZoneDef } from '@game/content';
import { cleanName, NAME_MAX } from '@game/coop';
import {
  BOARD_SIZE,
  boardKey,
  isTeamSize,
  KEY_PREFIX,
  PLAYER_ID_PATTERN,
  readTeamBoard,
  toPlacing,
  WEEK_TTL,
  type BoardId,
  type BoardRow,
  type Store,
} from '@game/hiscores';
import { ReplayError, replayRun, TICK_RATE, type Replay, type World } from '@game/sim';
import type {
  BoardResponse,
  HiscoreEntry,
  RunSubmission,
  RunSummary,
  SubmitResponse,
  TicketResponse,
} from '../src/hiscores/protocol';

/**
 * The hiscores API (PLAN.md §8):
 *   POST /api/ticket    { player }  → a seed for one ranked run
 *   POST /api/runs      RunSubmission → re-runs the replay, records the server's own score
 *   GET  /api/hiscores?board=week|all&size=1|2|3|4&player=…
 * Size 1 is solo; 2 to 4 are the co-op boards, which the co-op server records to.
 * Platform-free: server/node.ts adapts it to Node's http (Vercel and the Vite dev server).
 */

const TICKET_TTL = 24 * 60 * 60;
/** Requests per IP per minute. */
const LIMITS = { ticket: 30, runs: 10, hiscores: 120 } as const;
/** A run can't take less real time than its wave time; this allows for rounding. */
const CLOCK_SLACK_MS = 5000;
const ID_PATTERN = /^[0-9a-f]{32}$/;

export interface ApiRequest {
  readonly method: string;
  /** Last path segment: ticket, runs or hiscores. */
  readonly route: string;
  readonly query: URLSearchParams;
  readonly body: unknown;
  readonly ip: string;
}

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
  readonly cacheControl?: string;
}

export interface ApiOptions {
  readonly store: Store | null;
  /** The rules hash this server was built with; runs from other rules can't be replayed here. */
  readonly rules: string;
  readonly zone?: ZoneDef;
  readonly now?: () => number;
  readonly log?: (message: string) => void;
}

interface Ticket {
  readonly seed: number;
  readonly player: string;
  readonly issued: number;
}

export function createApi({
  store,
  rules,
  zone = ZONES.wolfmoor,
  now = Date.now,
  log = (message) => console.warn(message),
}: ApiOptions): (req: ApiRequest) => Promise<ApiResponse> {
  return async (req) => {
    if (!store) return fail(503, 'Hiscores are not set up on this server yet.');
    const allow = (method: string, handler: () => Promise<ApiResponse>) =>
      req.method === method ? handler() : Promise.resolve(fail(405, `Use ${method}.`));
    try {
      switch (req.route) {
        case 'ticket':
          return await allow('POST', () => ticket(store, req));
        case 'runs':
          return await allow('POST', () => submit(store, req));
        case 'hiscores':
          return await allow('GET', () => board(store, req));
        default:
          return fail(404, 'Not found.');
      }
    } catch (error) {
      log(`hiscores ${req.route} failed: ${String(error instanceof Error ? error.stack : error)}`);
      return fail(500, 'Something went wrong on the hiscores server.');
    }
  };

  async function ticket(store: Store, req: ApiRequest): Promise<ApiResponse> {
    const { player } = (req.body ?? {}) as { player?: unknown };
    if (typeof player !== 'string' || !PLAYER_ID_PATTERN.test(player))
      return fail(400, 'Bad player id.');
    if (await limited(store, 'ticket', req.ip))
      return fail(429, 'Too many requests. Try again in a minute.');

    const [seed, ...rest] = crypto.getRandomValues(new Uint32Array(5));
    const id = [...rest].map((n) => n.toString(16).padStart(8, '0')).join('');
    const value: Ticket = { seed: seed!, player, issued: now() };
    await store.put(`${KEY_PREFIX}:ticket:${id}`, JSON.stringify(value), TICKET_TTL);
    return ok({ ticket: id, seed: seed! } satisfies TicketResponse);
  }

  async function submit(store: Store, req: ApiRequest): Promise<ApiResponse> {
    const run = req.body as Partial<RunSubmission> | null;
    if (!run || typeof run !== 'object') return fail(400, 'Expected a run.');
    const { ticket: ticketId, player, score, replay } = run;
    if (typeof ticketId !== 'string' || !ID_PATTERN.test(ticketId)) return fail(400, 'Bad ticket.');
    if (typeof player !== 'string' || !PLAYER_ID_PATTERN.test(player))
      return fail(400, 'Bad player id.');
    if (typeof score !== 'number' || !replay || typeof replay !== 'object')
      return fail(400, 'Expected a score and a replay.');
    const name = cleanName(run.name);
    if (!name) return fail(400, `Names are 1 to ${NAME_MAX} letters, numbers, spaces, - or _.`);
    if (run.rules !== rules)
      return fail(409, 'The game has been updated. Reload the page to post scores.');
    if (await limited(store, 'runs', req.ip))
      return fail(429, 'Too many runs posted. Try again in a minute.');

    const stored = await store.take(`${KEY_PREFIX}:ticket:${ticketId}`);
    if (!stored)
      return fail(410, "This run can't be posted: its ticket expired or was already used.");
    const ticket = JSON.parse(stored) as Ticket;
    if (ticket.player !== player) return fail(403, 'This ticket belongs to another player.');
    if (replay.seed !== ticket.seed) return fail(422, "The replay doesn't match its ticket.");

    let world: World;
    try {
      world = replayRun(replay as Replay, zone);
    } catch (error) {
      if (!(error instanceof ReplayError)) throw error;
      log(`rejected replay from ${player}: ${error.message}`);
      return fail(422, `The replay didn't check out (${error.message}).`);
    }
    if (world.stats.score !== score) {
      log(`replay score mismatch from ${player}: client ${score}, server ${world.stats.score}`);
      return fail(422, "The replay didn't produce the same score.");
    }
    const waveMs = (world.stats.timeTicks / TICK_RATE) * 1000;
    if (waveMs > now() - ticket.issued + CLOCK_SLACK_MS) {
      return fail(422, 'This run finished faster than it could be played.');
    }

    const details = JSON.stringify(summarize(world, name, replay as Replay, now()));
    const entry = { member: player, score: world.stats.score, details };
    const [week, all] = await Promise.all([
      store.record(boardKey('week', 1, now()), entry, WEEK_TTL),
      store.record(boardKey('all', 1, now()), entry, null),
    ]);
    return ok({
      score: world.stats.score,
      boards: { week: toPlacing(week), all: toPlacing(all) },
    } satisfies SubmitResponse);
  }

  async function board(store: Store, req: ApiRequest): Promise<ApiResponse> {
    const id: BoardId = req.query.get('board') === 'all' ? 'all' : 'week';
    const size = Number(req.query.get('size') ?? 1);
    const raw = req.query.get('player');
    const player = raw && PLAYER_ID_PATTERN.test(raw) ? raw : null;
    if (await limited(store, 'hiscores', req.ip))
      return fail(429, 'Too many requests. Try again in a minute.');
    // Without a player the response is the same for everyone, so the CDN can share it briefly.
    const cacheControl = player ? 'no-store' : 'public, s-maxage=10, stale-while-revalidate=30';
    if (isTeamSize(size))
      return { ...ok(await readTeamBoard(store, id, size, player, now())), cacheControl };

    const key = boardKey(id, 1, now());
    const [rows, mine] = await Promise.all([
      store.top(key, BOARD_SIZE),
      player ? store.find(key, player) : Promise.resolve(null),
    ]);
    const body: BoardResponse = {
      board: id,
      entries: rows.map(toEntry).filter((e) => e !== null),
      you: mine ? toEntry(mine) : null,
    };
    return { ...ok(body), cacheControl };
  }

  async function limited(store: Store, kind: keyof typeof LIMITS, ip: string): Promise<boolean> {
    const minute = Math.floor(now() / 60_000);
    return (await store.count(`${KEY_PREFIX}:rate:${kind}:${ip}:${minute}`, 120)) > LIMITS[kind];
  }
}

function summarize(world: World, name: string, replay: Replay, at: number): RunSummary {
  const p = world.players[0]!;
  return {
    name,
    score: world.stats.score,
    wave: world.wave,
    won: world.outcome === 'victory',
    weapon: replay.weapon,
    kills: world.stats.kills,
    level: p.level,
    ticks: world.stats.timeTicks,
    date: new Date(at).toISOString(),
  };
}

function toEntry(row: BoardRow): HiscoreEntry | null {
  if (!row.details) return null;
  return { ...(JSON.parse(row.details) as RunSummary), score: row.score, rank: row.rank + 1 };
}

function ok(body: unknown): ApiResponse {
  return { status: 200, body };
}

function fail(status: number, error: string): ApiResponse {
  return { status, body: { error } };
}
