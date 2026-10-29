import type { ClientToServer, ServerToClient } from '@game/coop';
import { randomBytes, randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { Server, type Socket } from 'socket.io';
import { roomCode, Rooms } from './rooms';

/**
 * The co-op socket server (PLAN.md §9), hosted on Railway. Rooms and their
 * lockstep clocks live in memory; GET /health is for the platform's checks.
 *   PORT             default 8787
 *   ALLOWED_ORIGINS  comma-separated, e.g. https://bob-vs-the-haunted-swamp-ruby.vercel.app
 */

const PORT = Number(process.env.PORT ?? 8787);
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
// Railway sets RAILWAY_ENVIRONMENT, so a deploy is locked down even without NODE_ENV.
const PRODUCTION =
  process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);
/** The server's clock: rooms send frames every this many ms (3 frames at 60 per second). */
const TICK_MS = 50;

/** Production allows only ALLOWED_ORIGINS; dev also allows the Vite dev server on this machine or the LAN. */
function allowed(origin: string | undefined): boolean {
  if (!origin) return !PRODUCTION;
  if (ALLOWED.includes(origin)) return true;
  if (PRODUCTION) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(
    origin,
  );
}

const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);
const now = () => performance.now();

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`ok ${rooms.size} rooms`);
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server<ClientToServer, ServerToClient>(http, {
  cors: { origin: (origin, done) => done(null, allowed(origin)) },
  // CORS doesn't cover WebSocket upgrades, so check the page's origin on every connection too.
  allowRequest: (req, done) => done(null, allowed(req.headers.origin)),
  // Inputs are tiny; nothing legitimate is anywhere near this.
  maxHttpBufferSize: 64 * 1024,
});

const rooms = new Rooms(
  (code) => ({
    all: (event, ...args) => io.to(code).emit(event, ...args),
    one: (socket, event, ...args) => io.to(socket).emit(event, ...args),
  }),
  {
    seed: () => randomInt(0, 2 ** 32 - 1),
    token: () => randomBytes(16).toString('hex'),
    code: () => roomCode((n) => randomInt(0, n)),
  },
  log,
);

/** Per-socket message budget per second, by kind: inputs come at up to 60 a second. */
const BUDGET = { input: 90, action: 30, other: 20 } as const;

io.on('connection', (socket: Socket<ClientToServer, ServerToClient>) => {
  const spent = { input: 0, action: 0, other: 0 };
  const refill = setInterval(() => Object.assign(spent, { input: 0, action: 0, other: 0 }), 1000);
  const within = (kind: keyof typeof BUDGET) => ++spent[kind] <= BUDGET[kind];
  const ack = (fn: unknown) => (typeof fn === 'function' ? (fn as (r: unknown) => void) : () => {});

  const enter = (code: string) => {
    for (const r of socket.rooms) if (r !== socket.id) void socket.leave(r);
    void socket.join(code);
  };

  socket.on('create', (p, reply) => {
    if (!within('other')) return;
    const r = rooms.create(socket.id, p ?? {}, now());
    if (r.ok) enter(r.lobby.code);
    ack(reply)(r);
  });
  socket.on('join', (p, reply) => {
    if (!within('other')) return;
    const r = rooms.join(socket.id, p ?? {}, now());
    if (r.ok) enter(r.lobby.code);
    ack(reply)(r);
  });
  socket.on('update', (p) => within('other') && rooms.of(socket.id)?.update(socket.id, p ?? {}));
  socket.on('start', () => within('other') && rooms.of(socket.id)?.start(socket.id, now()));
  socket.on(
    'input',
    (x, y) => within('input') && rooms.of(socket.id)?.input(socket.id, x, y, now()),
  );
  socket.on('action', (a) => within('action') && rooms.of(socket.id)?.action(socket.id, a));
  socket.on(
    'hash',
    (frame, hash) => within('other') && rooms.of(socket.id)?.hash(socket.id, frame, hash),
  );
  socket.on('leave', () => {
    for (const r of socket.rooms) if (r !== socket.id) void socket.leave(r);
    rooms.leaveAny(socket.id, now(), true);
  });
  socket.on('disconnect', () => {
    clearInterval(refill);
    rooms.leaveAny(socket.id, now());
  });
});

setInterval(() => rooms.tick(now()), TICK_MS);

http.listen(PORT, () =>
  log(`co-op server on :${PORT}${ALLOWED.length ? `, allowing ${ALLOWED.join(', ')}` : ''}`),
);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log(`${signal}: closing`);
    io.emit('closed', 'The co-op server is restarting. Start a new game in a moment.');
    io.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
