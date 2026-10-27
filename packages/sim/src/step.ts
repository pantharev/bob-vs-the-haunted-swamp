import { NEUTRAL_INPUT, type InputCommand } from './input';
import type { Arena, Player, World } from './world';

export const TICK_RATE = 60;
/** Fixed sim timestep (s). Never varies: determinism depends on it. */
export const DT = 1 / TICK_RATE;

/**
 * Fraction of the gap to target velocity closed each tick. 0.35 at 60 Hz
 * reaches 90% of top speed in ~5 ticks (~85 ms): snappy, but with enough
 * ramp for the procedural walk animation to read.
 */
const VELOCITY_RESPONSE = 0.35;
/** Below this |moveX| the player keeps facing the same way. */
const FACING_THRESHOLD = 0.1;

/** Advance the world by exactly one tick. `inputs[i]` drives `world.players[i]`. */
export function step(world: World, inputs: readonly InputCommand[]): void {
  world.tick++;
  for (let i = 0; i < world.players.length; i++) {
    movePlayer(world.players[i]!, inputs[i] ?? NEUTRAL_INPUT, world.arena);
  }
}

function movePlayer(p: Player, input: InputCommand, arena: Arena): void {
  p.prevX = p.x;
  p.prevY = p.y;

  let mx = input.moveX;
  let my = input.moveY;
  // Math.sqrt is exactly specified across JS engines (unlike Math.hypot/sin),
  // which keeps replays verifiable server-side.
  const len = Math.sqrt(mx * mx + my * my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }

  p.vx += (mx * p.moveSpeed - p.vx) * VELOCITY_RESPONSE;
  p.vy += (my * p.moveSpeed - p.vy) * VELOCITY_RESPONSE;
  p.x += p.vx * DT;
  p.y += p.vy * DT;

  if (p.x < p.radius) {
    p.x = p.radius;
    p.vx = 0;
  } else if (p.x > arena.width - p.radius) {
    p.x = arena.width - p.radius;
    p.vx = 0;
  }
  if (p.y < p.radius) {
    p.y = p.radius;
    p.vy = 0;
  } else if (p.y > arena.height - p.radius) {
    p.y = arena.height - p.radius;
    p.vy = 0;
  }

  if (mx > FACING_THRESHOLD) p.facing = 1;
  else if (mx < -FACING_THRESHOLD) p.facing = -1;
}
