import type { WerewolfDef } from '@game/content';
import { DT, MAX_ENEMY_RADIUS, seconds } from './constants';
import { clamp } from './math';
import type { Enemy, Player, World } from './world';

/** Fraction of the gap to the desired velocity closed per tick. */
const STEER = 0.2;
const KNOCKBACK_DECAY = 0.84;
/** Fraction of an overlap between two enemies resolved per tick (each side). */
const SEPARATION = 0.25;
/** Hands curve in from the side while further away than this (wu). */
const FLANK_DISTANCE = 320;
const FLANK_BEND = 0.85;

const separationNear: number[] = [];

/** AI, steering, knockback and separation for every enemy. */
export function updateEnemies(world: World): void {
  const { enemies, grid, arena } = world;
  grid.rebuild(enemies);

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!;
    if (!e.alive) continue;
    e.prevX = e.x;
    e.prevY = e.y;

    const target = nearestPlayer(world, e.x, e.y);
    let desiredX = 0;
    let desiredY = 0;
    if (target) {
      let dx = target.x - e.x;
      let dy = target.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.001) {
        dx /= dist;
        dy /= dist;
      }
      switch (e.def.behaviour) {
        case 'chase':
          desiredX = dx * e.speed;
          desiredY = dy * e.speed;
          break;
        case 'flank': {
          const bend = Math.min(1, dist / FLANK_DISTANCE) * FLANK_BEND * e.flankSide;
          let fx = dx - dy * bend;
          let fy = dy + dx * bend;
          const len = Math.sqrt(fx * fx + fy * fy);
          fx /= len;
          fy /= len;
          desiredX = fx * e.speed;
          desiredY = fy * e.speed;
          break;
        }
        case 'werewolf':
          if (e.def.werewolf) {
            werewolf(world, e, e.def.werewolf, dx, dy, dist);
            desiredX = e.action === 'walk' ? dx * e.speed : 0;
            desiredY = e.action === 'walk' ? dy * e.speed : 0;
          }
          break;
      }
    }

    if (e.action === 'lunge') {
      e.vx = e.dirX * (e.def.werewolf?.lungeSpeed ?? 0);
      e.vy = e.dirY * (e.def.werewolf?.lungeSpeed ?? 0);
    } else {
      e.vx += (desiredX - e.vx) * STEER;
      e.vy += (desiredY - e.vy) * STEER;
    }

    // Push out of overlapping neighbours. Each enemy moves only itself; the
    // neighbour does the same on its own turn, so the pair splits the overlap.
    let sepX = 0;
    let sepY = 0;
    const near = grid.query(e.x, e.y, e.radius + MAX_ENEMY_RADIUS, separationNear);
    for (const index of near) {
      if (index === i) continue;
      const o = enemies[index]!;
      if (!o.alive) continue;
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const min = e.radius + o.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      if (d2 < 0.0001) {
        // Exactly stacked (e.g. a fresh slime split): nudge apart by id.
        sepX += e.id < o.id ? -0.5 : 0.5;
        continue;
      }
      const d = Math.sqrt(d2);
      const push = ((min - d) / d) * SEPARATION;
      sepX += dx * push;
      sepY += dy * push;
    }

    e.x = clamp(e.x + (e.vx + e.kx) * DT + sepX, e.radius, arena.width - e.radius);
    e.y = clamp(e.y + (e.vy + e.ky) * DT + sepY, e.radius, arena.height - e.radius);
    e.kx *= KNOCKBACK_DECAY;
    e.ky *= KNOCKBACK_DECAY;
  }
}

/**
 * Human form walks. Below the threshold it turns into a wolf: faster, and
 * every few seconds it stops, flashes red, then lunges in a locked direction.
 */
function werewolf(world: World, e: Enemy, w: WerewolfDef, dx: number, dy: number, dist: number): void {
  if (!e.transformed && e.hp < e.maxHp * w.transformBelow) {
    e.transformed = true;
    e.speed = w.wolfSpeed;
    e.cooldown = seconds(0.5);
    world.events.push({ type: 'transform', id: e.id });
  }
  if (!e.transformed) return;

  switch (e.action) {
    case 'walk':
      if (e.cooldown > 0) e.cooldown--;
      else if (dist < w.lungeTrigger) {
        e.action = 'telegraph';
        e.actionTicks = seconds(w.telegraph);
        e.dirX = dx;
        e.dirY = dy;
        world.events.push({ type: 'telegraph', id: e.id });
      }
      break;
    case 'telegraph':
      if (--e.actionTicks <= 0) {
        e.action = 'lunge';
        e.actionTicks = seconds(w.lungeTime);
        world.events.push({ type: 'lunge', id: e.id });
      }
      break;
    case 'lunge':
      if (--e.actionTicks <= 0) {
        e.action = 'walk';
        e.cooldown = seconds(w.lungeCooldown);
      }
      break;
  }
}

export function nearestPlayer(world: World, x: number, y: number): Player | null {
  let best: Player | null = null;
  let bestD2 = Infinity;
  for (const p of world.players) {
    if (!p.alive) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}

export function nearestEnemy(world: World, x: number, y: number, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD2 = Infinity;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    const reach = range + e.radius;
    if (d2 < bestD2 && d2 <= reach * reach) {
      bestD2 = d2;
      best = e;
    }
  }
  return best;
}
