import type { WeaponId } from '@game/content';
import {
  INPUT_HEARTBEAT_MS,
  type ClientToServer,
  type JoinResult,
  type Lobby,
  type Member,
  type RunStart,
  type ServerToClient,
} from '@game/coop';
import type { RunAction } from '@game/sim';
import type { Socket } from 'socket.io-client';
import type { Game } from '../game';

/**
 * The browser side of co-op (PLAN.md §9): the room you're in, its lobby, and
 * the socket to the co-op server. The run itself is played by Game, from the
 * frames this hands it. socket.io-client loads only once co-op is opened.
 */

/** The co-op server. In dev, the one `npm run dev -w @game/server` starts on this machine. */
export const COOP_URL: string =
  import.meta.env.VITE_COOP_URL ||
  (import.meta.env.DEV ? `${location.protocol}//${location.hostname}:8787` : '');

const JOIN_TIMEOUT_MS = 8000;

type Joining = (
  socket: Socket<ServerToClient, ClientToServer>,
  ack: (r: JoinResult) => void,
) => void;

export class Coop {
  lobby: Lobby | null = null;
  seat: number | null = null;
  busy = false;
  error: string | null = null;
  /** True while the socket is down mid-game; it reconnects on its own. */
  reconnecting = false;
  private socket: Socket<ServerToClient, ClientToServer> | null = null;
  private sent = { x: 0, y: 0, at: -Infinity };
  private pending: RunStart | null = null;

  constructor(private readonly game: Game) {}

  /** This tab already has a seat in that game (a reload mid-game). */
  static hasToken(code: string): boolean {
    return readToken(code) !== null;
  }

  static get available(): boolean {
    return COOP_URL !== '';
  }

  get me(): Member | undefined {
    return this.lobby?.members.find((m) => m.seat === this.seat);
  }

  get isHost(): boolean {
    return this.lobby !== null && this.lobby.host === this.seat;
  }

  get inviteLink(): string {
    return `${location.origin}${location.pathname}?room=${this.lobby?.code ?? ''}`;
  }

  create(name: string, weapon: WeaponId): Promise<void> {
    return this.enter((s, ack) => s.emit('create', { name, weapon }, ack));
  }

  join(code: string, name: string, weapon: WeaponId): Promise<void> {
    const token = readToken(code) ?? undefined;
    return this.enter((s, ack) => s.emit('join', { code, name, weapon, token }, ack));
  }

  update(p: { name?: string; weapon?: WeaponId; ready?: boolean }): void {
    this.socket?.emit('update', p);
  }

  start(): void {
    this.socket?.emit('start');
  }

  /** Leaves the room for good (no rejoin) and returns to the title screen. */
  leave(): void {
    const code = this.lobby?.code;
    this.socket?.emit('leave');
    if (code) clearToken(code);
    this.lobby = null;
    this.seat = null;
    this.error = null;
    history.replaceState(null, '', location.pathname);
    this.game.leaveCoop();
  }

  /** Movement in 1/127 steps: sent when it changes, and as a heartbeat. */
  sendInput(x: number, y: number, now: number): void {
    const s = this.sent;
    if (x === s.x && y === s.y && now - s.at < INPUT_HEARTBEAT_MS) return;
    this.sent = { x, y, at: now };
    this.socket?.emit('input', x, y);
  }

  sendAction(action: RunAction): void {
    this.socket?.emit('action', action);
  }

  sendHash(frame: number, hash: number): void {
    this.socket?.emit('hash', frame, hash);
  }

  private async enter(send: Joining): Promise<void> {
    this.busy = true;
    this.error = null;
    this.notify();
    try {
      const socket = await this.connect();
      const result = await new Promise<JoinResult>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), JOIN_TIMEOUT_MS);
        send(socket, (r) => {
          clearTimeout(timer);
          resolve(r);
        });
      });
      if (!result.ok) {
        this.error = result.error;
        return;
      }
      this.seat = result.seat;
      this.lobby = result.lobby;
      writeToken(result.lobby.code, result.token);
      // The address bar now holds the invite link, and a reload rejoins.
      history.replaceState(null, '', `?room=${result.lobby.code}`);
      const pending = this.pending;
      this.pending = null;
      if (pending) this.begin(pending);
    } catch {
      this.error = "Couldn't reach the co-op server. Try again in a moment.";
    } finally {
      this.busy = false;
      this.notify();
    }
  }

  private async connect(): Promise<Socket<ServerToClient, ClientToServer>> {
    if (this.socket?.connected) return this.socket;
    if (!this.socket) {
      const { io } = await import('socket.io-client');
      this.socket = io(COOP_URL, { transports: ['websocket'], reconnectionDelayMax: 3000 });
      this.wire(this.socket);
    }
    const socket = this.socket;
    if (!socket.connected) {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', (e) => reject(e));
      });
    }
    return socket;
  }

  private wire(socket: Socket<ServerToClient, ClientToServer>): void {
    socket.on('lobby', (lobby) => {
      this.lobby = lobby;
      this.notify();
    });
    socket.on('start', (start) => this.begin(start));
    socket.on('resync', (start) => this.begin(start));
    socket.on('frames', (from, frames) => this.game.pushFrames(from, frames));
    socket.on('closed', (reason) => {
      this.error = reason;
      this.lobby = null;
      this.seat = null;
      this.game.leaveCoop();
    });
    socket.on('disconnect', () => {
      if (!this.lobby) return;
      this.reconnecting = true;
      this.notify();
    });
    // Back after a drop: take our seat again with the token; mid-run the server resyncs us.
    socket.io.on('reconnect', () => {
      const lobby = this.lobby;
      const me = this.me;
      const token = lobby ? readToken(lobby.code) : null;
      if (!lobby || !me || !token) return;
      socket.emit('join', { code: lobby.code, name: me.name, weapon: me.weapon, token }, (r) => {
        this.reconnecting = false;
        if (r.ok) this.lobby = r.lobby;
        else this.error = r.error;
        this.notify();
      });
    });
  }

  private begin(start: RunStart): void {
    // A rejoin's resync can beat the join's answer: hold it until we know our seat.
    if (this.seat === null) {
      this.pending = start;
      return;
    }
    const me = start.roster.findIndex((r) => r.seat === this.seat);
    if (me >= 0) this.game.startCoop(start, me);
  }

  private notify(): void {
    this.game.notify();
  }
}

// The rejoin token lives for the browser tab: a reload takes the same seat back.
function readToken(code: string): string | null {
  try {
    return sessionStorage.getItem(`bob.coop.${code}`);
  } catch {
    return null;
  }
}

function writeToken(code: string, token: string): void {
  try {
    sessionStorage.setItem(`bob.coop.${code}`, token);
  } catch {
    // Without storage a reload just can't rejoin.
  }
}

function clearToken(code: string): void {
  try {
    sessionStorage.removeItem(`bob.coop.${code}`);
  } catch {
    // Nothing stored.
  }
}
