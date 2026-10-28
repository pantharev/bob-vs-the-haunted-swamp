import { WEAPONS, type ArcWeapon, type LobWeapon, type ProjectileWeapon } from '@game/content';
import { DT, MAX_ENEMY_RADIUS, TICK_RATE, seconds } from './constants';
import { explode, weaponHit } from './combat';
import { nearestEnemy } from './enemies';
import { aoeMultiplier, attackSpeedMultiplier } from './stats';
import type { Enemy, Player, Projectile, World } from './world';

/** Projectiles this far outside the arena are gone. */
const OFFSCREEN_MARGIN = 60;

const arcNear: number[] = [];
const projectileNear: number[] = [];

/** Each weapon fires at the nearest enemy in its range when its cooldown is up. */
export function updateWeapons(world: World): void {
  for (const p of world.players) {
    if (!p.alive) continue;
    for (const w of p.weapons) {
      if (w.cooldown > 0) {
        w.cooldown--;
        continue;
      }
      const def = WEAPONS[w.id];
      const target = nearestEnemy(world, p.x, p.y, def.range);
      if (!target) continue;

      let dx = target.x - p.x;
      let dy = target.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.001) {
        dx /= d;
        dy /= d;
      } else {
        dx = p.facing;
        dy = 0;
      }

      if (def.pattern === 'arc') swing(world, p, def, dx, dy);
      else if (def.pattern === 'projectile') shoot(world, p, def, dx, dy);
      else lob(world, p, def, target);
      world.events.push({ type: 'attack', player: p.id, weapon: def.id, x: p.x, y: p.y, dirX: dx, dirY: dy });
      w.cooldown = Math.max(1, Math.round((def.cooldown * TICK_RATE) / attackSpeedMultiplier(p)));
    }
  }
}

function swing(world: World, p: Player, def: ArcWeapon, dx: number, dy: number): void {
  const near = world.grid.query(p.x, p.y, def.range + MAX_ENEMY_RADIUS, arcNear);
  for (const index of near) {
    const e = world.enemies[index];
    if (!e?.alive) continue;
    const ex = e.x - p.x;
    const ey = e.y - p.y;
    const reach = def.range + e.radius;
    const d2 = ex * ex + ey * ey;
    if (d2 > reach * reach) continue;
    const d = Math.sqrt(d2);
    // Anything touching Bob is hit whatever the angle.
    const inCone = d <= e.radius + p.radius || ex * dx + ey * dy >= def.arcCos * d;
    if (inCone) weaponHit(world, p, def, e, d > 0.001 ? ex / d : dx, d > 0.001 ? ey / d : dy);
  }
}

function shoot(world: World, p: Player, def: ProjectileWeapon, dx: number, dy: number): void {
  const pr = acquire(world, p, def.id);
  pr.x = pr.prevX = p.x + dx * p.radius;
  pr.y = pr.prevY = p.y + dy * p.radius;
  pr.vx = dx * def.speed;
  pr.vy = dy * def.speed;
  pr.radius = def.projectileRadius;
  pr.life = Math.ceil((def.range / def.speed) * TICK_RATE * 1.15);
  pr.pierce = def.pierce;
}

function lob(world: World, p: Player, def: LobWeapon, target: Enemy): void {
  const pr = acquire(world, p, def.id);
  const flight = Math.max(1, seconds(def.flightTime));
  pr.lob = true;
  pr.x = pr.prevX = pr.startX = p.x;
  pr.y = pr.prevY = pr.startY = p.y;
  pr.targetX = target.x;
  pr.targetY = target.y;
  pr.flight = flight;
  pr.life = flight + 1;
  pr.vx = ((target.x - p.x) / flight) * TICK_RATE;
  pr.vy = ((target.y - p.y) / flight) * TICK_RATE;
}

export function updateProjectiles(world: World): void {
  const { arena } = world;
  for (const pr of world.projectiles) {
    if (!pr.alive) continue;
    pr.prevX = pr.x;
    pr.prevY = pr.y;
    const owner = world.players[pr.owner];
    const def = WEAPONS[pr.weapon];
    if (!owner?.alive) {
      pr.alive = false;
      continue;
    }

    if (pr.lob) {
      pr.age++;
      const t = Math.min(1, pr.age / pr.flight);
      pr.x = pr.startX + (pr.targetX - pr.startX) * t;
      pr.y = pr.startY + (pr.targetY - pr.startY) * t;
      if (pr.age >= pr.flight) {
        pr.alive = false;
        if (def.pattern === 'lob') explode(world, owner, def, pr.x, pr.y, def.splash * aoeMultiplier(owner));
      }
      continue;
    }

    pr.x += pr.vx * DT;
    pr.y += pr.vy * DT;
    if (
      --pr.life <= 0 ||
      pr.x < -OFFSCREEN_MARGIN ||
      pr.y < -OFFSCREEN_MARGIN ||
      pr.x > arena.width + OFFSCREEN_MARGIN ||
      pr.y > arena.height + OFFSCREEN_MARGIN
    ) {
      pr.alive = false;
      continue;
    }
    if (def.pattern !== 'projectile') continue;

    const near = world.grid.query(pr.x, pr.y, pr.radius + MAX_ENEMY_RADIUS, projectileNear);
    for (const index of near) {
      const e = world.enemies[index];
      if (!e?.alive || pr.hits.includes(e.id)) continue;
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      const reach = pr.radius + e.radius;
      if (dx * dx + dy * dy > reach * reach) continue;

      pr.hits.push(e.id);
      if (def.splash > 0) explode(world, owner, def, pr.x, pr.y, def.splash * aoeMultiplier(owner));
      else weaponHit(world, owner, def, e, pr.vx / def.speed, pr.vy / def.speed);
      if (--pr.pierce < 0) {
        pr.alive = false;
        break;
      }
    }
  }
}

function acquire(world: World, p: Player, weapon: Projectile['weapon']): Projectile {
  const pr = world.pools.projectiles.pop() ?? blankProjectile();
  pr.id = world.nextId++;
  pr.alive = true;
  pr.owner = p.id;
  pr.weapon = weapon;
  pr.vx = pr.vy = 0;
  pr.radius = 0;
  pr.life = 0;
  pr.pierce = 0;
  pr.hits.length = 0;
  pr.lob = false;
  pr.startX = pr.startY = pr.targetX = pr.targetY = 0;
  pr.age = 0;
  pr.flight = 0;
  world.projectiles.push(pr);
  return pr;
}

function blankProjectile(): Projectile {
  return {
    id: 0,
    alive: false,
    owner: 0,
    weapon: 'shortbow',
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    radius: 0,
    life: 0,
    pierce: 0,
    hits: [],
    lob: false,
    startX: 0,
    startY: 0,
    targetX: 0,
    targetY: 0,
    age: 0,
    flight: 0,
  };
}
