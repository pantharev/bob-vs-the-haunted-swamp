import { MAX_PARTY, WEAPON_IDS, type WeaponId } from '@game/content';
import {
  cleanName,
  COOP_FPS,
  EMPTY_ROOM_MS,
  hashDue,
  INPUT_TIMEOUT_MS,
  SHOP_FRAMES,
  startWorld,
  stepFrame,
  type Frame,
  type JoinResult,
  type Lobby,
  type RosterEntry,
  type RunStart,
  type ServerToClient,
} from '@game/coop';
import { applyAction, worldHash, type RunAction, type World } from '@game/sim';

/**
 * One co-op room (PLAN.md §9): the lobby, then the lockstep clock. It owns the
 * authoritative world: it applies every accepted action and step itself, so it
 * knows when waves end, readies stragglers, and spots clients that drift.
 * Sockets stay outside: `out` delivers messages, `now` is a monotonic clock.
 */

export interface Outbox {
  /** To every connected member. */
  all<E extends keyof ServerToClient>(event: E, ...args: Parameters<ServerToClient[E]>): void;
  /** To one socket. */
  one<E extends keyof ServerToClient>(
    socket: string,
    event: E,
    ...args: Parameters<ServerToClient[E]>
  ): void;
}

export interface Randomness {
  seed(): number;
  token(): string;
}

interface Seat {
  readonly seat: number;
  name: string;
  weapon: WeaponId;
  ready: boolean;
  /** Rejoins this seat; cleared when the player leaves on purpose. */
  token: string;
  /** null while disconnected. */
  socket: string | null;
  /** Index into the running world's players, while a run is on. */
  player: number | null;
  input: [number, number];
  heardAt: number;
}

interface Run {
  readonly world: World;
  readonly seed: number;
  readonly roster: readonly RosterEntry[];
  /** Every frame so far, for rejoins and resyncs. */
  readonly frames: Frame[];
  /** Clock time the run started (frame 0). */
  startedAt: number;
  /** Player actions in arrival order, applied in the next frame. */
  readonly actions: [number, RunAction][];
  /** Frame the current intermission opened at. */
  intermissionSince: number | null;
  /** Server hash after recent hash frames. */
  readonly hashes: Map<number, number>;
}

/** Frames behind the clock that the server will still catch up on; beyond that it skips ahead. */
const MAX_BACKLOG = COOP_FPS;
const KEEP_HASHES = 10;

export class Room {
  private readonly seats: (Seat | null)[] = Array.from({ length: MAX_PARTY }, () => null);
  private host = 0;
  private run: Run | null = null;
  private emptySince: number | null = null;

  constructor(
    readonly code: string,
    private readonly out: Outbox,
    private readonly random: Randomness,
    private readonly log: (message: string) => void = () => {},
  ) {}

  /** The running world (tests and diagnostics). */
  get world(): World | null {
    return this.run?.world ?? null;
  }

  get phase(): 'lobby' | 'run' {
    return this.run ? 'run' : 'lobby';
  }

  /** True once nobody has been connected for EMPTY_ROOM_MS. */
  expired(now: number): boolean {
    return this.emptySince !== null && now - this.emptySince > EMPTY_ROOM_MS;
  }

  lobby(): Lobby {
    return {
      code: this.code,
      host: this.host,
      phase: this.phase,
      members: this.taken().map((s) => ({
        seat: s.seat,
        name: s.name,
        weapon: s.weapon,
        ready: s.ready,
        connected: s.socket !== null,
      })),
    };
  }

  join(
    socket: string,
    p: { name: unknown; weapon: unknown; token?: unknown },
    now: number,
  ): JoinResult {
    // A token takes back the seat it was issued for: reloads and dropped connections.
    const returning =
      typeof p.token === 'string' && p.token !== ''
        ? this.taken().find((s) => s.token === p.token)
        : undefined;
    if (returning) {
      returning.socket = socket;
      returning.heardAt = now;
      this.emptySince = null;
      if (!this.connected(this.host)) this.host = returning.seat;
      this.broadcast();
      if (this.run) this.out.one(socket, 'resync', this.snapshot(this.run));
      return { ok: true, seat: returning.seat, token: returning.token, lobby: this.lobby() };
    }

    const name = cleanName(p.name);
    if (!name)
      return { ok: false, error: 'Pick a name: 1 to 16 letters, numbers, spaces, - or _.' };
    const weapon = asWeapon(p.weapon);
    if (!weapon) return { ok: false, error: 'Pick a starting weapon.' };
    if (this.run)
      return {
        ok: false,
        error: 'That game has already started. Ask for a new link after it ends.',
      };
    const free = this.seats.findIndex((s) => s === null);
    if (free < 0) return { ok: false, error: `That game is full (${MAX_PARTY} players).` };

    const seat: Seat = {
      seat: free,
      name,
      weapon,
      ready: false,
      token: this.random.token(),
      socket,
      player: null,
      input: [0, 0],
      heardAt: now,
    };
    this.seats[free] = seat;
    if (!this.connected(this.host)) this.host = free;
    this.emptySince = null;
    this.broadcast();
    return { ok: true, seat: free, token: seat.token, lobby: this.lobby() };
  }

  update(socket: string, p: { name?: unknown; weapon?: unknown; ready?: unknown }): void {
    const seat = this.bySocket(socket);
    if (!seat || this.run) return;
    if (p.name !== undefined) seat.name = cleanName(p.name) ?? seat.name;
    if (p.weapon !== undefined) seat.weapon = asWeapon(p.weapon) ?? seat.weapon;
    if (typeof p.ready === 'boolean') seat.ready = p.ready;
    this.broadcast();
  }

  /** Host only, once every connected player is ready. */
  start(socket: string, now: number): void {
    const seat = this.bySocket(socket);
    if (!seat || seat.seat !== this.host || this.run) return;
    const players = this.taken().filter((s) => s.socket !== null);
    if (players.length === 0 || players.some((s) => !s.ready)) return;

    const roster = players.map((s, i) => {
      s.player = i;
      s.input = [0, 0];
      s.heardAt = now;
      return { seat: s.seat, name: s.name, weapon: s.weapon };
    });
    // Seats that dropped out of the lobby don't come along.
    for (const s of this.taken()) if (s.socket === null) this.seats[s.seat] = null;
    const seed = this.random.seed();
    const run: Run = {
      world: startWorld({ seed, roster, frames: [] }),
      seed,
      roster,
      frames: [],
      startedAt: now,
      actions: [],
      intermissionSince: null,
      hashes: new Map(),
    };
    this.run = run;
    this.log(`room ${this.code}: run started with ${roster.length} player(s), seed ${seed}`);
    this.out.all('start', this.snapshot(run));
    this.broadcast();
  }

  input(socket: string, x: unknown, y: unknown, now: number): void {
    const seat = this.bySocket(socket);
    if (!seat || seat.player === null) return;
    seat.input = [asStep(x), asStep(y)];
    seat.heardAt = now;
  }

  action(socket: string, action: unknown): void {
    const seat = this.bySocket(socket);
    if (!seat || seat.player === null || !this.run || !isAction(action)) return;
    // Bounded: a player can't queue more than a shop's worth of clicks per frame.
    if (this.run.actions.length < 64) this.run.actions.push([seat.player, action]);
  }

  hash(socket: string, frame: unknown, hash: unknown): void {
    const run = this.run;
    const seat = this.bySocket(socket);
    if (!run || !seat || typeof frame !== 'number') return;
    const ours = run.hashes.get(frame);
    if (ours === undefined || ours === hash) return;
    this.log(`room ${this.code}: ${seat.name} drifted at frame ${frame}; resyncing`);
    this.out.one(socket, 'resync', this.snapshot(run));
  }

  /** The socket dropped, or the player left on purpose (`left`). */
  disconnect(socket: string, now: number, left = false): void {
    const seat = this.bySocket(socket);
    if (!seat) return;
    if (this.run) {
      // Mid-run the player stays in the world, standing idle, and can rejoin unless they left.
      seat.socket = null;
      if (left) seat.token = '';
    } else {
      this.seats[seat.seat] = null;
    }
    if (seat.seat === this.host) {
      const next = this.taken().find((s) => s.socket !== null);
      if (next) this.host = next.seat;
    }
    if (!this.taken().some((s) => s.socket !== null)) this.emptySince = now;
    this.broadcast();
  }

  /** Advances the lockstep clock to `now`, sending whatever frames came due. */
  tick(now: number): void {
    const run = this.run;
    if (!run) return;
    let due = Math.floor(((now - run.startedAt) * COOP_FPS) / 1000) - run.frames.length;
    if (due > MAX_BACKLOG) {
      // The server stalled: skip ahead instead of firing a burst.
      run.startedAt += ((due - MAX_BACKLOG) * 1000) / COOP_FPS;
      due = MAX_BACKLOG;
    }
    if (due <= 0) return;
    const from = run.frames.length;
    const fresh: Frame[] = [];
    for (let i = 0; i < due; i++) fresh.push(this.nextFrame(run, now));
    this.out.all('frames', from, fresh);
    if (run.world.phase === 'over') this.finish(run);
  }

  /** Builds, applies and records one frame. */
  private nextFrame(run: Run, now: number): Frame {
    const { world } = run;
    const index = run.frames.length;
    const accepted: [number, RunAction][] = [];
    const accept = (player: number, action: RunAction) => {
      if (applyAction(world, player, action)) accepted.push([player, action]);
    };
    for (const [player, action] of run.actions.splice(0)) accept(player, action);

    if (world.phase === 'intermission') {
      run.intermissionSince ??= index;
      const late = index >= run.intermissionSince + SHOP_FRAMES;
      for (const seat of this.taken()) {
        if (seat.player === null) continue;
        const p = world.players[seat.player];
        // Disconnected players never hold the others up; the rest get SHOP_FRAMES to shop.
        if (!p || p.intermission === 'ready' || (seat.socket !== null && !late)) continue;
        for (let guard = 0; p.intermission === 'levelUp' && guard < 32; guard++) {
          accept(seat.player, { type: 'chooseUpgrade', index: 0 });
        }
        accept(seat.player, { type: 'ready' });
      }
    } else {
      run.intermissionSince = null;
    }

    const m: number[] = [];
    for (const r of run.roster) {
      const seat = this.seats[r.seat];
      const fresh = seat && seat.socket !== null && now - seat.heardAt <= INPUT_TIMEOUT_MS;
      m.push(fresh ? seat.input[0] : 0, fresh ? seat.input[1] : 0);
    }
    const frame: Frame = accepted.length ? { m, a: accepted } : { m };
    stepFrame(world, frame);
    run.frames.push(frame);
    if (hashDue(index)) {
      run.hashes.set(index, worldHash(world));
      if (run.hashes.size > KEEP_HASHES) run.hashes.delete(run.hashes.keys().next().value!);
    }
    return frame;
  }

  /** The run is over: back to the lobby, everyone un-readied. */
  private finish(run: Run): void {
    this.log(`room ${this.code}: run over (${run.world.outcome}, score ${run.world.stats.score})`);
    this.run = null;
    for (const s of this.taken()) {
      s.player = null;
      s.ready = false;
      if (s.socket === null) this.seats[s.seat] = null;
    }
    this.broadcast();
  }

  private snapshot(run: Run): RunStart {
    return { seed: run.seed, roster: run.roster, frames: run.frames };
  }

  private broadcast(): void {
    this.out.all('lobby', this.lobby());
  }

  private taken(): Seat[] {
    return this.seats.filter((s): s is Seat => s !== null);
  }

  private bySocket(socket: string): Seat | undefined {
    return this.taken().find((s) => s.socket === socket);
  }

  private connected(seat: number): boolean {
    return (this.seats[seat]?.socket ?? null) !== null;
  }
}

function asWeapon(raw: unknown): WeaponId | null {
  return (WEAPON_IDS as readonly unknown[]).includes(raw) ? (raw as WeaponId) : null;
}

function asStep(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) ? Math.max(-127, Math.min(127, raw)) : 0;
}

const ACTIONS: ReadonlySet<string> = new Set([
  'chooseUpgrade',
  'buy',
  'reroll',
  'toggleLock',
  'sellWeapon',
  'ready',
]);

function isAction(raw: unknown): raw is RunAction {
  if (!raw || typeof raw !== 'object') return false;
  const { type, index } = raw as { type?: unknown; index?: unknown };
  if (typeof type !== 'string' || !ACTIONS.has(type)) return false;
  return (
    index === undefined ||
    (Number.isInteger(index) && (index as number) >= 0 && (index as number) < 64)
  );
}
