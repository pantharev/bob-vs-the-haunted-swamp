import { ZONES } from '@game/content';
import {
  applyAction,
  createWorld,
  quantizeInput,
  step,
  type InputCommand,
  type SimEvent,
  type World,
} from '@game/sim';
import { HASH_FRAMES, type Frame, type RunStart } from './protocol';

/**
 * The one way a co-op world advances, on the server and in every browser
 * (PLAN.md §9). Same start + same frames = same world, bit for bit.
 */

const STEPS = 127;

export function startWorld(start: RunStart): World {
  return createWorld({
    seed: start.seed,
    zone: ZONES.wolfmoor,
    loadouts: start.roster.map((r) => [r.weapon]),
  });
}

/**
 * Applies the frame's accepted actions, then one sim step with everyone's
 * movement. `onEvents` sees the events of each action and of the step
 * (the sim clears them in between).
 */
export function applyFrame(
  world: World,
  frame: Frame,
  onEvents?: (events: readonly SimEvent[]) => void,
): void {
  for (const [player, action] of frame.a ?? []) {
    applyAction(world, player, action);
    onEvents?.(world.events);
  }
  stepFrame(world, frame);
  onEvents?.(world.events);
}

/** The frame's sim step alone. The server applies (and so validates) the actions itself first. */
export function stepFrame(world: World, frame: Frame): void {
  step(world, inputs(world, frame));
}

/** Whether a hash is due after applying frame number `frame` (0-based). */
export function hashDue(frame: number): boolean {
  return (frame + 1) % HASH_FRAMES === 0;
}

/** A command as the integer 1/127 steps the protocol carries: quantizeInput, unscaled. */
export function toSteps(command: InputCommand): [number, number] {
  const q = quantizeInput(command);
  return [Math.round(q.moveX * STEPS) || 0, Math.round(q.moveY * STEPS) || 0];
}

function inputs(world: World, frame: Frame): InputCommand[] {
  return world.players.map((_, i) => ({
    moveX: (frame.m[2 * i] ?? 0) / STEPS,
    moveY: (frame.m[2 * i + 1] ?? 0) / STEPS,
  }));
}
