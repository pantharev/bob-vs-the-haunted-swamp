import { DT, MAX_ENEMY_RADIUS, TICK_RATE } from './constants';
import { healPlayer, hurtPlayer } from './combat';
import { NEUTRAL_INPUT, type InputCommand } from './input';
import type { Player, World } from './world';

/**
 * Fraction of the gap to target velocity closed each tick. 0.35 at 60 Hz
 * reaches 90% of top speed in ~5 ticks (~85 ms): snappy, but with enough
 * ramp for the procedural walk animation to read.
 */
const VELOCITY_RESPONSE = 0.35;
/** Below this |moveX| the player keeps facing the same way. */
const FACING_THRESHOLD = 0.1;
/** Speed multiplier while standing in slime goo. */
const GOO_SLOW = 0.55;
/** Enemies hurt on touch slightly inside their radius, which feels fairer. */
const CONTACT_REACH = 0.85;

const contactNear: number[] = [];

export function updatePlayers(world: World, inputs: readonly InputCommand[]): void {
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i]!;
    p.prevX = p.x;
    p.prevY = p.y;
    if (!p.alive) continue;
    if (p.invulnerable > 0) p.invulnerable--;
    p.slowed = inGoo(world, p);
    movePlayer(p, inputs[i] ?? NEUTRAL_INPUT, world);
    regenerate(world, p);
  }
}

function movePlayer(p: Player, input: InputCommand, world: World): void {
  const { arena } = world;
  let mx = input.moveX;
  let my = input.moveY;
  // Math.sqrt is exactly specified across JS engines (unlike Math.hypot/sin),
  // which keeps replays verifiable server-side.
  const len = Math.sqrt(mx * mx + my * my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }

  const speed = p.moveSpeed * (p.slowed ? GOO_SLOW : 1);
  p.vx += (mx * speed - p.vx) * VELOCITY_RESPONSE;
  p.vy += (my * speed - p.vy) * VELOCITY_RESPONSE;
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

function inGoo(world: World, p: Player): boolean {
  for (const g of world.goo) {
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    if (dx * dx + dy * dy < g.radius * g.radius) return true;
  }
  return false;
}

function regenerate(world: World, p: Player): void {
  if (p.stats.regen <= 0 || p.hp >= p.maxHp) {
    p.regenCarry = 0;
    return;
  }
  p.regenCarry += p.stats.regen / TICK_RATE;
  if (p.regenCarry >= 1) {
    p.regenCarry -= 1;
    healPlayer(world, p, 1);
  }
}

/** Enemies touching a vulnerable player hurt them; one hit per i-frame window. */
export function contactDamage(world: World): void {
  for (const p of world.players) {
    if (!p.alive || p.invulnerable > 0) continue;
    const near = world.grid.query(p.x, p.y, p.radius + MAX_ENEMY_RADIUS, contactNear);
    for (const index of near) {
      const e = world.enemies[index];
      if (!e?.alive) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const reach = p.radius + e.radius * CONTACT_REACH;
      if (dx * dx + dy * dy > reach * reach) continue;
      hurtPlayer(world, p, e.damage);
      break;
    }
  }
}
