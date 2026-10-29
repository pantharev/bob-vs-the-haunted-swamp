import {
  applyFrame,
  hashDue,
  SHOP_FRAMES,
  startWorld,
  type Frame,
  type JoinResult,
  type Lobby,
  type RunStart,
  type ServerToClient,
} from '@game/coop';
import { worldHash, type World } from '@game/sim';
import { describe, expect, it } from 'vitest';
import { Room, type Outbox } from '../src/room';
import { roomCode, Rooms } from '../src/rooms';

/** A browser stand-in: keeps its own world from the messages it gets, like the real client. */
class Client {
  world: World | null = null;
  frame = 0;
  lobby: Lobby | null = null;
  resyncs = 0;
  readonly log: string[] = [];
  constructor(readonly socket: string) {}

  receive<E extends keyof ServerToClient>(event: E, args: Parameters<ServerToClient[E]>): void {
    this.log.push(event);
    if (event === 'lobby') this.lobby = args[0] as Lobby;
    if (event === 'start' || event === 'resync') {
      if (event === 'resync') this.resyncs++;
      const s = args[0] as RunStart;
      this.world = startWorld(s);
      this.frame = 0;
      for (const f of s.frames) this.apply(f);
    }
    if (event === 'frames') {
      const [from, frames] = args as [number, Frame[]];
      expect(from).toBe(this.frame);
      for (const f of frames) this.apply(f);
    }
  }

  private apply(frame: Frame): void {
    applyFrame(this.world!, frame);
    this.frame++;
  }
}

function setup() {
  const clients = new Map<string, Client>();
  const members = new Set<string>();
  const out: Outbox = {
    all: (event, ...args) => {
      for (const s of members) clients.get(s)!.receive(event, args);
    },
    one: (socket, event, ...args) => clients.get(socket)?.receive(event, args),
  };
  let n = 0;
  const room = new Room('ABCDEF', out, { seed: () => 12345, token: () => `token-${++n}` });
  let clock = 0;
  const join = (socket: string, name = socket, weapon = 'dagger', token?: string): JoinResult => {
    if (!clients.has(socket)) clients.set(socket, new Client(socket));
    members.add(socket);
    const r = room.join(socket, { name, weapon, token }, clock);
    if (!r.ok) members.delete(socket);
    return r;
  };
  const drop = (socket: string, left = false) => {
    members.delete(socket);
    room.disconnect(socket, clock, left);
  };
  /** Advances the clock in 50 ms server ticks. */
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 50) {
      clock += 50;
      room.tick(clock);
    }
  };
  return {
    room,
    clients,
    join,
    drop,
    run,
    now: () => clock,
    client: (s: string) => clients.get(s)!,
  };
}

function startWith(...names: string[]) {
  const t = setup();
  const tokens = new Map<string, string>();
  for (const name of names) {
    const r = t.join(name);
    if (r.ok) tokens.set(name, r.token);
  }
  for (const name of names) t.room.update(name, { ready: true });
  t.room.start(names[0]!, t.now());
  return { ...t, tokens };
}

describe('lobby', () => {
  it('seats players in order, makes the first the host, and turns the fifth away', () => {
    const t = setup();
    for (const s of ['a', 'b', 'c', 'd']) expect(t.join(s).ok).toBe(true);
    const fifth = t.join('e');
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) expect(fifth.error).toMatch(/full/);
    const lobby = t.room.lobby();
    expect(lobby.host).toBe(0);
    expect(lobby.members.map((m) => m.name)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('refuses bad names and weapons', () => {
    const t = setup();
    expect(t.join('a', '').ok).toBe(false);
    expect(t.join('b', 'Bob!').ok).toBe(false);
    expect(t.join('c', 'Bob', 'excalibur').ok).toBe(false);
  });

  it('starts only from the host, once everyone is ready', () => {
    const t = setup();
    t.join('a');
    t.join('b');
    t.room.update('a', { ready: true });
    t.room.start('a', t.now());
    expect(t.room.phase).toBe('lobby');
    t.room.update('b', { ready: true });
    t.room.start('b', t.now());
    expect(t.room.phase).toBe('lobby');
    t.room.start('a', t.now());
    expect(t.room.phase).toBe('run');
    expect(t.client('b').world?.players).toHaveLength(2);
  });

  it('hands the host to the next player and frees seats left in the lobby', () => {
    const t = setup();
    t.join('a');
    t.join('b');
    t.join('c');
    t.drop('a');
    const lobby = t.room.lobby();
    expect(lobby.host).toBe(1);
    expect(lobby.members.map((m) => m.seat)).toEqual([1, 2]);
    expect(t.join('d').ok && t.room.lobby().members.find((m) => m.name === 'd')?.seat).toBe(0);
  });

  it('turns new players away once a run has started', () => {
    const t = startWith('a', 'b');
    const late = t.join('c');
    expect(late.ok).toBe(false);
  });
});

describe('lockstep', () => {
  it('keeps every client identical to the server, frame for frame', () => {
    const t = startWith('a', 'b', 'c');
    const pattern = [
      [127, 0],
      [0, -127],
      [-90, 90],
      [0, 0],
    ] as const;
    for (let second = 0; second < 30; second++) {
      ['a', 'b', 'c'].forEach((s, i) => {
        const [x, y] = pattern[(second + i) % pattern.length]!;
        t.room.input(s, x, y, t.now());
      });
      t.run(1000);
    }
    const server = worldHash(t.room.world!);
    for (const s of ['a', 'b', 'c']) {
      expect(t.client(s).frame).toBe(30 * 60);
      expect(worldHash(t.client(s).world!)).toBe(server);
    }
  });

  it('confirms matching hashes and resyncs a client that drifted', () => {
    const t = startWith('a', 'b');
    // One second in, the clients have applied exactly frames 0-59.
    t.run(1000);
    const frame = 59;
    expect(hashDue(frame)).toBe(true);
    expect(t.client('a').frame).toBe(frame + 1);
    // A client whose world matches gets nothing back.
    t.room.hash('a', frame, worldHash(t.client('a').world!));
    expect(t.client('a').resyncs).toBe(0);
    // A drifted one is rebuilt from the frame log.
    t.room.hash('b', frame, 42);
    expect(t.client('b').resyncs).toBe(1);
    expect(worldHash(t.client('b').world!)).toBe(worldHash(t.room.world!));
  });

  it('applies accepted actions in the frame and drops refused ones', () => {
    const t = startWith('a', 'b');
    t.run(20_500);
    expect(t.room.world!.phase).toBe('intermission');
    t.room.action('a', { type: 'reroll' }); // not enough coins or not in the shop yet: refused
    t.room.action('a', { type: 'chooseUpgrade', index: 0 });
    t.run(100);
    for (const s of ['a', 'b'])
      expect(worldHash(t.client(s).world!)).toBe(worldHash(t.room.world!));
  });

  it('readies players still shopping when the shop timer runs out', () => {
    const t = startWith('a', 'b');
    t.run(20_500);
    expect(t.room.world!.phase).toBe('intermission');
    t.run(((SHOP_FRAMES - 60) * 1000) / 60);
    expect(t.room.world!.phase).toBe('intermission');
    t.run(2000);
    expect(t.room.world!.phase).toBe('wave');
    expect(t.room.world!.wave).toBe(2);
    expect(worldHash(t.client('b').world!)).toBe(worldHash(t.room.world!));
  });

  it("doesn't make anyone wait for a disconnected player, and lets them rejoin", () => {
    const t = startWith('a', 'b');
    const token = t.tokens.get('b')!;
    t.room.input('b', 127, 0, t.now());
    t.drop('b');
    t.run(20_500);
    // Only "a" has to choose; "b" was readied the moment the shop opened.
    const b = t.room.world!.players[1]!;
    expect(b.intermission).toBe('ready');
    // Back with the token: rebuilt from the log, identical to the server.
    expect(t.join('b', 'b', 'dagger', token).ok).toBe(true);
    expect(t.client('b').resyncs).toBe(1);
    expect(worldHash(t.client('b').world!)).toBe(worldHash(t.room.world!));
  });

  it('lets an idle player stand still after the input timeout', () => {
    const t = startWith('a', 'b');
    t.room.input('a', 127, 0, t.now());
    t.run(3000);
    const p = t.room.world!.players[0]!;
    const x = p.x;
    t.run(1000);
    // No heartbeat for over 2 s: no longer moving right.
    expect(p.x).toBeLessThanOrEqual(x + 1);
  });

  it('skips ahead instead of bursting after a stall', () => {
    const t = startWith('a');
    t.run(1000);
    const before = t.client('a').frame;
    // One tick after a 10 s stall.
    t.room.tick(t.now() + 10_000);
    expect(t.client('a').frame - before).toBeLessThanOrEqual(60);
  });

  it('goes back to the lobby when the run ends, everyone un-readied', () => {
    const t = startWith('a', 'b');
    t.run(1000);
    for (const p of t.room.world!.players) {
      p.alive = false;
      p.hp = 0;
    }
    // The clients' copies have to match for the frame that ends it.
    for (const s of ['a', 'b'])
      for (const p of t.client(s).world!.players) Object.assign(p, { alive: false, hp: 0 });
    t.run(100);
    expect(t.room.phase).toBe('lobby');
    expect(t.client('a').world!.phase).toBe('over');
    expect(t.room.lobby().members.every((m) => !m.ready)).toBe(true);
  });
});

describe('rooms', () => {
  it('makes codes from the unambiguous alphabet and finds rooms case-insensitively', () => {
    let i = 0;
    const code = roomCode(() => i++ % 7);
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
    const rooms = new Rooms(() => ({ all() {}, one() {} }), {
      seed: () => 1,
      token: () => 't',
      code: () => 'QWERTY',
    });
    expect(rooms.create('a', { name: 'Ann', weapon: 'staff' }, 0).ok).toBe(true);
    expect(rooms.join('b', { code: ' qwerty ', name: 'Bo', weapon: 'staff' }, 0).ok).toBe(true);
    expect(rooms.join('c', { code: 'NOPE22', name: 'Cy', weapon: 'staff' }, 0).ok).toBe(false);
    expect(rooms.of('b')?.code).toBe('QWERTY');
  });

  it('closes rooms that stay empty', () => {
    const rooms = new Rooms(() => ({ all() {}, one() {} }), {
      seed: () => 1,
      token: () => 't',
      code: () => 'QWERTY',
    });
    rooms.create('a', { name: 'Ann', weapon: 'staff' }, 0);
    rooms.leaveAny('a', 0);
    rooms.tick(60_000);
    expect(rooms.size).toBe(1);
    rooms.tick(11 * 60_000);
    expect(rooms.size).toBe(0);
  });
});
