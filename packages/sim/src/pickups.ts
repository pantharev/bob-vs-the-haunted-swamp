import { DT } from './constants';
import { gainXp, healPlayer } from './combat';
import { pickupRange } from './stats';
import type { Pickup, Player, World } from './world';

/** Drop scatter slows by this factor per tick. */
const SCATTER_FRICTION = 0.86;
/** Magnetised pickups accelerate by this much per tick (wu/s), up to the cap. */
const MAGNET_ACCEL = 45;
const MAGNET_MAX_SPEED = 1100;
/** Collected when this close to the player's edge (wu). */
const COLLECT_REACH = 8;

export function updatePickups(world: World): void {
  for (const pk of world.pickups) {
    if (!pk.alive) continue;
    pk.prevX = pk.x;
    pk.prevY = pk.y;

    if (pk.target < 0) {
      pk.x += pk.vx * DT;
      pk.y += pk.vy * DT;
      pk.vx *= SCATTER_FRICTION;
      pk.vy *= SCATTER_FRICTION;
      pk.target = magnetTarget(world, pk);
      if (pk.target < 0) continue;
    }

    const p = world.players[pk.target];
    if (!p?.alive) {
      pk.target = -1;
      pk.speed = 0;
      continue;
    }
    const dx = p.x - pk.x;
    const dy = p.y - pk.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    pk.speed = Math.min(MAGNET_MAX_SPEED, pk.speed + MAGNET_ACCEL);
    const move = pk.speed * DT;
    if (d <= p.radius + COLLECT_REACH || d <= move) {
      collect(world, p, pk);
    } else {
      pk.x += (dx / d) * move;
      pk.y += (dy / d) * move;
    }
  }
}

function magnetTarget(world: World, pk: Pickup): number {
  for (const p of world.players) {
    if (!p.alive) continue;
    const dx = p.x - pk.x;
    const dy = p.y - pk.y;
    const range = pickupRange(p);
    if (dx * dx + dy * dy <= range * range) return p.id;
  }
  return -1;
}

function collect(world: World, p: Player, pk: Pickup): void {
  pk.alive = false;
  if (pk.kind === 'food') {
    healPlayer(world, p, pk.value);
    world.events.push({ type: 'pickup', player: p.id, kind: 'food', value: pk.value });
    return;
  }
  // Coins banked from last wave double up pickups until the bank runs dry.
  const bonus = Math.min(p.bank, pk.value);
  p.bank -= bonus;
  const value = pk.value + bonus;
  p.coins += value;
  world.stats.coinsCollected += value;
  world.events.push({ type: 'pickup', player: p.id, kind: 'coin', value });
  gainXp(world, p, value);
}
