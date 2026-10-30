import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type JoinResult } from '@game/coop';
import { Room, type Outbox, type Randomness } from './room';

/** A browser on other rules than this server would drift out of lockstep. */
const OUTDATED: JoinResult = {
  ok: false,
  error: 'The game was just updated. Reload the page (give it a minute if it says this again).',
};

/** All live rooms, by code and by socket. */
export class Rooms {
  private readonly rooms = new Map<string, Room>();
  private readonly bySocket = new Map<string, Room>();

  constructor(
    private readonly outbox: (code: string) => Outbox,
    private readonly random: Randomness & { code(): string },
    /** This server's rules hash. */
    private readonly rules: string,
    private readonly log: (message: string) => void = () => {},
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  create(
    socket: string,
    p: { name: unknown; weapon: unknown; rules?: unknown },
    now: number,
  ): JoinResult {
    if (p.rules !== this.rules) return OUTDATED;
    this.leaveAny(socket, now);
    let code = this.random.code();
    for (let guard = 0; this.rooms.has(code) && guard < 100; guard++) code = this.random.code();
    const room = new Room(code, this.outbox(code), this.random, this.log);
    const joined = room.join(socket, p, now);
    if (joined.ok) {
      this.rooms.set(code, room);
      this.bySocket.set(socket, room);
      this.log(`room ${code} created`);
    }
    return joined;
  }

  join(
    socket: string,
    p: { code: unknown; name: unknown; weapon: unknown; rules?: unknown; token?: unknown },
    now: number,
  ): JoinResult {
    if (p.rules !== this.rules) return OUTDATED;
    const code = typeof p.code === 'string' ? p.code.trim().toUpperCase() : '';
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: "That game doesn't exist any more. Ask for a new link." };
    if (this.bySocket.get(socket) !== room) this.leaveAny(socket, now);
    const joined = room.join(socket, p, now);
    if (joined.ok) this.bySocket.set(socket, room);
    return joined;
  }

  of(socket: string): Room | undefined {
    return this.bySocket.get(socket);
  }

  /** The socket is gone, or left its room on purpose. */
  leaveAny(socket: string, now: number, left = false): void {
    const room = this.bySocket.get(socket);
    if (!room) return;
    this.bySocket.delete(socket);
    room.disconnect(socket, now, left);
  }

  tick(now: number): void {
    for (const [code, room] of this.rooms) {
      room.tick(now);
      if (room.expired(now)) {
        this.rooms.delete(code);
        this.log(`room ${code} closed (empty)`);
      }
    }
  }
}

/** A room code from the unambiguous alphabet. `int(n)` returns 0..n-1. */
export function roomCode(int: (n: number) => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++)
    code += ROOM_CODE_ALPHABET[int(ROOM_CODE_ALPHABET.length)];
  return code;
}
