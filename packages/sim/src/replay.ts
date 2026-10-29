import { WEAPON_IDS, type WeaponId, type ZoneDef } from '@game/content';
import { applyAction, type RunAction } from './actions';
import type { InputCommand } from './input';
import { createWorld } from './run';
import { step } from './step';
import type { World } from './world';

/**
 * Replays (PLAN.md §8). A solo run is fully described by its seed, starting
 * weapon, one movement command per wave tick and the between-wave actions,
 * so the server can re-run it and compute the score itself.
 */

export const REPLAY_FORMAT = 1;

/** Movement is stored as whole steps of 1/127 per axis (one signed byte each). */
const STEPS = 127;
/** Longest run of identical commands one record holds. */
const MAX_REPEAT = 256;
const MAX_ACTIONS = 5000;
const ACTION_TYPES: ReadonlySet<string> = new Set([
  'chooseUpgrade',
  'buy',
  'reroll',
  'toggleLock',
  'sellWeapon',
  'ready',
] satisfies RunAction['type'][]);

export interface ReplayAction {
  /** Wave ticks played before this action. */
  readonly tick: number;
  readonly action: RunAction;
}

export interface Replay {
  readonly format: number;
  readonly seed: number;
  readonly weapon: WeaponId;
  /** Base64 of 3-byte records: repeat count − 1, then x and y as signed steps. */
  readonly moves: string;
  readonly actions: readonly ReplayAction[];
}

export class ReplayError extends Error {
  override readonly name = 'ReplayError';
}

/** Rounds a command to what a replay stores. Live play must step with exactly this value. */
export function quantizeInput(command: InputCommand): InputCommand {
  return { moveX: fromStep(toStep(command.moveX)), moveY: fromStep(toStep(command.moveY)) };
}

/** Records a run as it is played. Call `input` once per wave tick and `action` after each accepted action. */
export class ReplayRecorder {
  private readonly bytes: number[] = [];
  private readonly actions: ReplayAction[] = [];
  private ticks = 0;
  private runX = 0;
  private runY = 0;
  private runLength = 0;

  constructor(
    readonly seed: number,
    readonly weapon: WeaponId,
  ) {}

  /** Returns the quantized command; step the sim with it. */
  input(command: InputCommand): InputCommand {
    const x = toStep(command.moveX);
    const y = toStep(command.moveY);
    if (
      this.runLength > 0 &&
      (x !== this.runX || y !== this.runY || this.runLength === MAX_REPEAT)
    ) {
      this.flush();
    }
    this.runX = x;
    this.runY = y;
    this.runLength++;
    this.ticks++;
    return { moveX: fromStep(x), moveY: fromStep(y) };
  }

  action(action: RunAction): void {
    this.actions.push({ tick: this.ticks, action });
  }

  finish(): Replay {
    this.flush();
    return {
      format: REPLAY_FORMAT,
      seed: this.seed,
      weapon: this.weapon,
      moves: toBase64(this.bytes),
      actions: [...this.actions],
    };
  }

  private flush(): void {
    if (this.runLength === 0) return;
    this.bytes.push(this.runLength - 1, this.runX & 0xff, this.runY & 0xff);
    this.runLength = 0;
  }
}

/**
 * Re-runs a recorded solo run to its end. Throws ReplayError if the replay is
 * malformed, an action is refused, or the run doesn't end exactly where the
 * recording does.
 */
export function replayRun(replay: Replay, zone: ZoneDef): World {
  check(replay);
  const moves = fromBase64(replay.moves);
  const { actions } = replay;
  const world = createWorld({ seed: replay.seed, zone, weapons: [replay.weapon] });

  let tick = 0;
  let nextAction = 0;
  let at = 0;
  let left = 0;
  const command = { moveX: 0, moveY: 0 };
  for (;;) {
    while (nextAction < actions.length && actions[nextAction]!.tick === tick) {
      if (!applyAction(world, 0, actions[nextAction]!.action)) {
        throw new ReplayError(`action ${nextAction} was refused`);
      }
      nextAction++;
    }
    if (world.phase === 'over') break;
    if (world.phase === 'intermission')
      throw new ReplayError(`stalled between waves at tick ${tick}`);
    if (left === 0) {
      if (at + 3 > moves.length) throw new ReplayError(`ran out of moves mid-wave at tick ${tick}`);
      left = moves[at]! + 1;
      command.moveX = fromStep(signed(moves[at + 1]!));
      command.moveY = fromStep(signed(moves[at + 2]!));
      at += 3;
    }
    step(world, [command]);
    left--;
    tick++;
  }
  if (nextAction < actions.length) throw new ReplayError('actions left after the run ended');
  if (left > 0 || at < moves.length) throw new ReplayError('moves left after the run ended');
  return world;
}

function check(replay: Replay): void {
  const { format, seed, weapon, moves, actions } = replay as Partial<Replay>;
  if (format !== REPLAY_FORMAT) throw new ReplayError(`unknown replay format ${String(format)}`);
  if (!Number.isInteger(seed) || seed! < 0 || seed! > 0xffffffff) throw new ReplayError('bad seed');
  if (!(WEAPON_IDS as readonly unknown[]).includes(weapon)) throw new ReplayError('bad weapon');
  if (typeof moves !== 'string' || moves.length % 4 !== 0) throw new ReplayError('bad moves');
  if (!Array.isArray(actions) || actions.length > MAX_ACTIONS) throw new ReplayError('bad actions');
  for (const entry of actions as unknown[]) {
    const { tick, action } = (entry ?? {}) as Partial<ReplayAction>;
    const { type, index } = (action ?? {}) as { type?: unknown; index?: unknown };
    const indexOk = index === undefined || (Number.isInteger(index) && (index as number) >= 0);
    if (
      !Number.isInteger(tick) ||
      typeof type !== 'string' ||
      !ACTION_TYPES.has(type) ||
      !indexOk
    ) {
      throw new ReplayError('bad action');
    }
  }
}

function toStep(v: number): number {
  if (!Number.isFinite(v)) return 0;
  // `|| 0` turns -0 into 0, so live play and replays see the same number.
  return Math.round(Math.max(-1, Math.min(1, v)) * STEPS) || 0;
}

function fromStep(s: number): number {
  return s / STEPS;
}

function signed(byte: number): number {
  return byte > 127 ? byte - 256 : byte;
}

// Base64 by hand: the sim has no DOM or Node APIs (no btoa, no Buffer).
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

function toBase64(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[n >> 18]! + ALPHABET[(n >> 12) & 63]!;
    out +=
      b === undefined
        ? '=='
        : ALPHABET[(n >> 6) & 63]! + (c === undefined ? '=' : ALPHABET[n & 63]!);
  }
  return out;
}

function fromBase64(text: string): Uint8Array {
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - padding);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const c = text[i + k]!;
      const v = c === '=' && i + 4 === text.length ? 0 : LOOKUP.get(c);
      if (v === undefined) throw new ReplayError('bad moves');
      n = (n << 6) | v;
    }
    if (o < out.length) out[o++] = (n >> 16) & 0xff;
    if (o < out.length) out[o++] = (n >> 8) & 0xff;
    if (o < out.length) out[o++] = n & 0xff;
  }
  return out;
}
