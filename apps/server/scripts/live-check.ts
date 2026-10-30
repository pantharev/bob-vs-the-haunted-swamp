// Plays a short co-op run against a co-op server with two scripted clients that run the
// same lockstep code as the browser, and reports sync, frame timing and input latency.
//   npm run live-check -w @game/server [-- <server url> [<rules hash>]]
// Defaults: the Railway server, and the rules hash of this checkout (it must match the deploy).
import {
  applyFrame,
  hashDue,
  startWorld,
  type ClientToServer,
  type Frame,
  type JoinResult,
  type Lobby,
  type RunStart,
  type ServerToClient,
} from '@game/coop';
import { worldHash, type World } from '@game/sim';
import { io, type Socket } from 'socket.io-client';
import { rulesVersion } from '../../client/scripts/rules-version';

const URL = process.argv[2] ?? 'https://gameserver-production-174b.up.railway.app';
const ORIGIN = 'https://bob-vs-the-haunted-swamp-ruby.vercel.app';
const RULES = process.argv[3] ?? rulesVersion();

class Bot {
  socket: Socket<ServerToClient, ClientToServer>;
  world: World | null = null;
  applied = 0;
  lobby: Lobby | null = null;
  seat = -1;
  me = -1;
  resyncs = 0;
  hashes = new Map<number, number>();
  bundles: number[] = [];
  /** When an input change was sent, and when a frame first carried it. */
  probe: { sent: number; value: number; seenAt: number | null } | null = null;

  constructor(readonly name: string) {
    this.socket = io(URL, {
      transports: ['websocket'],
      extraHeaders: { origin: ORIGIN },
      reconnection: false,
    });
    this.socket.on('lobby', (l) => (this.lobby = l));
    this.socket.on('start', (s) => this.begin(s));
    this.socket.on('resync', (s) => {
      this.resyncs++;
      this.begin(s);
    });
    this.socket.on('frames', (from, frames) => {
      this.bundles.push(performance.now());
      if (from !== this.applied)
        throw new Error(`${this.name}: gap at ${from}, have ${this.applied}`);
      for (const f of frames) this.apply(f);
    });
  }

  connected(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.on('connect', () => resolve());
      this.socket.on('connect_error', (e) => reject(e));
    });
  }

  call(event: 'create' | 'join', p: object): Promise<JoinResult> {
    return new Promise((resolve) =>
      (this.socket.emit as (...a: unknown[]) => void)(event, { ...p, rules: RULES }, resolve),
    );
  }

  private begin(s: RunStart): void {
    this.me = s.roster.findIndex((r) => r.seat === this.seat);
    this.world = startWorld(s);
    this.applied = 0;
    for (const f of s.frames) this.apply(f);
  }

  private apply(f: Frame): void {
    applyFrame(this.world!, f);
    const i = this.applied++;
    if (this.probe && this.probe.seenAt === null && f.m[2 * this.me] === this.probe.value) {
      this.probe.seenAt = performance.now();
    }
    if (hashDue(i)) {
      const h = worldHash(this.world!);
      this.hashes.set(i, h);
      this.socket.emit('hash', i, h);
    }
  }

  move(x: number, y: number): void {
    this.socket.emit('input', x, y);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const out: Record<string, unknown> = {};
const host = new Bot('host');
const guest = new Bot('guest');
await Promise.all([host.connected(), guest.connected()]);

const created = await host.call('create', { name: 'LiveHost', weapon: 'staff' });
if (!created.ok) throw new Error(created.error);
host.seat = created.seat;
const joined = await guest.call('join', {
  code: created.lobby.code,
  name: 'LiveGuest',
  weapon: 'shortbow',
});
if (!joined.ok) throw new Error(joined.error);
guest.seat = joined.seat;
out.room = created.lobby.code;
host.socket.emit('update', { ready: true });
guest.socket.emit('update', { ready: true });
await sleep(500);
host.socket.emit('start');
await sleep(1000);
out.started = [host.world !== null, guest.world !== null];

// Keep inputs alive (heartbeats) and wander; measure input-to-frame latency a few times.
const latencies: number[] = [];
const dirs: [number, number][] = [
  [127, 0],
  [0, 127],
  [-127, 0],
  [0, -127],
];
for (let i = 0; i < 22; i++) {
  const [x, y] = dirs[i % 4]!;
  host.probe = { sent: performance.now(), value: x, seenAt: null };
  host.move(x, y);
  guest.move(-x, -y);
  await sleep(500);
  if (host.probe.seenAt !== null) latencies.push(host.probe.seenAt - host.probe.sent);
  host.move(x, y);
  guest.move(-x, -y);
  await sleep(500);
}
out.wave1End = [host.world!.phase, guest.world!.phase];

// Shop: everyone ready (picking first upgrades if levelled), then wave 2.
for (let k = 0; k < 6 && host.world!.phase === 'intermission'; k++) {
  for (const b of [host, guest]) {
    const p = b.world!.players[b.me]!;
    b.socket.emit(
      'action',
      p.intermission === 'levelUp' ? { type: 'chooseUpgrade', index: 0 } : { type: 'ready' },
    );
  }
  await sleep(400);
}
await sleep(1500);
out.wave2 = [host.world!.wave, host.world!.phase, guest.world!.wave, guest.world!.phase];

const shared = [...host.hashes.keys()].filter((k) => guest.hashes.has(k));
out.hashChecks = shared.length;
out.hashesEqual = shared.every((k) => host.hashes.get(k) === guest.hashes.get(k));
out.resyncs = [host.resyncs, guest.resyncs];
out.frames = [host.applied, guest.applied];
const gaps = host.bundles.slice(1).map((t, i) => t - host.bundles[i]!);
gaps.sort((a, b) => a - b);
out.bundleGapMs = {
  median: Math.round(gaps[gaps.length >> 1]!),
  p95: Math.round(gaps[Math.floor(gaps.length * 0.95)]!),
};
latencies.sort((a, b) => a - b);
out.inputLatencyMs = {
  min: Math.round(latencies[0]!),
  median: Math.round(latencies[latencies.length >> 1]!),
  max: Math.round(latencies[latencies.length - 1]!),
};

host.socket.emit('leave');
guest.socket.emit('leave');
await sleep(300);
host.socket.close();
guest.socket.close();
console.log(JSON.stringify(out, null, 1));
process.exit(0);
