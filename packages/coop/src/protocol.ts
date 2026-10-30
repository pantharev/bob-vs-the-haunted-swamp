import type { WeaponId } from '@game/content';
import type { RunAction } from '@game/sim';

/**
 * The co-op wire protocol (PLAN.md §9), shared by the socket server and the
 * browser. Lockstep: the server is the clock and sends every player's input
 * for each frame; every client runs the same sim on the same frames.
 */

export const COOP_FPS = 60;
/** Frames per bundle: the server sends one every 50 ms. */
export const BUNDLE_FRAMES = 3;
/** Clients report their world hash after every this many frames. */
export const HASH_FRAMES = 60;
/** Players still shopping are readied this long after an intermission opens. */
export const SHOP_FRAMES = 45 * COOP_FPS;
/** A player not heard from for this long stands still. */
export const INPUT_TIMEOUT_MS = 2000;
/** Clients repeat their input this often even when it hasn't changed, to show they're there. */
export const INPUT_HEARTBEAT_MS = 500;
/** A disconnected player can rejoin the same run within this. */
export const RECONNECT_MS = 2 * 60_000;
/** A room with nobody connected closes after this. */
export const EMPTY_ROOM_MS = 10 * 60_000;
export const ROOM_CODE_LENGTH = 6;
/** No lookalikes: no 0/O, 1/I/L. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface Member {
  /** Lobby seat, 0-3; stays the same for the room's life. */
  readonly seat: number;
  readonly name: string;
  readonly weapon: WeaponId;
  readonly ready: boolean;
  readonly connected: boolean;
}

export interface Lobby {
  readonly code: string;
  readonly host: number;
  readonly members: readonly Member[];
  /** 'run' while a run is being played. */
  readonly phase: 'lobby' | 'run';
}

/** One sim frame: each player's movement, then any between-wave choices the server accepted. */
export interface Frame {
  /** Movement as signed 1/127 steps: [x0, y0, x1, y1, …], one pair per player. */
  readonly m: readonly number[];
  /** [player, action] in the order they apply, before the step. */
  readonly a?: readonly (readonly [number, RunAction])[];
}

export interface RosterEntry {
  /** Lobby seat this player came from. */
  readonly seat: number;
  readonly name: string;
  readonly weapon: WeaponId;
}

/** Everything a client needs to build the run's world, plus any frames already played (rejoin, resync). */
export interface RunStart {
  readonly seed: number;
  /** In player order: roster[i] plays world.players[i]. */
  readonly roster: readonly RosterEntry[];
  readonly frames: readonly Frame[];
}

export type JoinResult =
  | { readonly ok: true; readonly seat: number; readonly token: string; readonly lobby: Lobby }
  | { readonly ok: false; readonly error: string };

export interface ClientToServer {
  /** `rules` is the build's rules hash: the server only seats browsers running the same rules. */
  create(p: { name: string; weapon: WeaponId; rules: string }, ack: (r: JoinResult) => void): void;
  /** `token` rejoins the seat it was issued for (reloads, dropped connections). */
  join(
    p: { code: string; name: string; weapon: WeaponId; rules: string; token?: string },
    ack: (r: JoinResult) => void,
  ): void;
  /** Lobby changes to your own seat. */
  update(p: { name?: string; weapon?: WeaponId; ready?: boolean }): void;
  /** Host only, when everyone is ready. */
  start(): void;
  /** Your movement, as 1/127 steps. Sent on change and as a heartbeat. */
  input(x: number, y: number): void;
  action(a: RunAction): void;
  /** Your world hash after frame `frame` (every HASH_FRAMES). */
  hash(frame: number, hash: number): void;
  leave(): void;
}

export interface ServerToClient {
  lobby(l: Lobby): void;
  start(s: RunStart): void;
  /** Frames `from`, `from + 1`, … in order. */
  frames(from: number, frames: readonly Frame[]): void;
  /** Your world drifted: rebuild it from this. */
  resync(s: RunStart): void;
  /** Kicked out (room closed, server restarting). */
  closed(reason: string): void;
}
