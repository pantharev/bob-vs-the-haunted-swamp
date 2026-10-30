import { ELITE, ENEMIES, type EnemyId, type WeaponDef, type WeaponId } from '@game/content';
import { MAX_ENEMY_RADIUS, MAX_GOO, MAX_PICKUPS, seconds } from './constants';
import type { PickupKind } from './events';
import { randomUnit, type Vec } from './math';
import { partyHp } from './party';
import { scoreKill } from './score';
import {
  armourFactor,
  classDamageMultiplier,
  dodgeChance,
  recomputeStats,
  xpToNext,
} from './stats';
import type { Enemy, Pickup, Player, World } from './world';

/** Invulnerability after taking a hit, and after a dodge. */
const HIT_IFRAMES = seconds(0.45);
const DODGE_IFRAMES = seconds(0.2);
const FOOD_CHANCE = 0.02;
const FOOD_HEAL = 5;
/** Children of a split slime pop apart at this speed (wu/s). */
const SPLIT_POP = 180;

const unit: Vec = { x: 0, y: 0 };
const explosionNear: number[] = [];

export function spawnEnemy(world: World, id: EnemyId, x: number, y: number, elite: boolean): Enemy {
  const def = ENEMIES[id];
  const wave = world.waves[world.wave - 1];
  const hpScale = (wave?.hpScale ?? 1) * (elite ? ELITE.hp : 1) * partyHp(world, elite);
  const damageScale = (wave?.damageScale ?? 1) * (elite ? ELITE.damage : 1);

  const e = world.pools.enemies.pop() ?? blankEnemy();
  e.id = world.nextId++;
  e.def = def;
  e.elite = elite;
  e.alive = true;
  e.x = e.prevX = x;
  e.y = e.prevY = y;
  e.vx = e.vy = e.kx = e.ky = 0;
  e.maxHp = e.hp = Math.max(1, Math.round(def.hp * hpScale));
  e.radius = def.radius * (elite ? ELITE.radius : 1);
  e.speed = def.speed;
  e.damage = Math.max(1, Math.round(def.damage * damageScale));
  e.mass = def.mass * (elite ? ELITE.mass : 1);
  e.coins = def.coins * (elite ? ELITE.coins : 1);
  e.flankSide = world.rng.chance(0.5) ? 1 : -1;
  e.transformed = false;
  e.action = 'walk';
  e.actionTicks = 0;
  e.cooldown = 0;
  e.dirX = e.dirY = 0;
  // Elite werewolves arrive already in wolf form.
  if (def.werewolf && elite) {
    e.transformed = true;
    e.speed = def.werewolf.wolfSpeed;
  }
  world.enemies.push(e);
  return e;
}

export function damageEnemy(
  world: World,
  e: Enemy,
  amount: number,
  crit: boolean,
  pushX: number,
  pushY: number,
  killer: Player,
  weapon: WeaponId | null = null,
): void {
  if (!e.alive) return;
  const dealt = Math.min(amount, e.hp);
  world.stats.damageDealt += dealt;
  killer.damage += dealt;
  e.hp -= amount;
  world.events.push({ type: 'enemyHit', id: e.id, x: e.x, y: e.y, amount, crit, weapon });
  if (e.action !== 'lunge') {
    e.kx += pushX / e.mass;
    e.ky += pushY / e.mass;
  }
  if (e.hp <= 0) killEnemy(world, e, killer);
}

function killEnemy(world: World, e: Enemy, killer: Player): void {
  const { rng } = world;
  const { def } = e;
  e.alive = false;
  e.hp = 0;
  world.stats.kills++;
  killer.kills++;
  scoreKill(world, e);
  world.events.push({
    type: 'enemyDeath',
    id: e.id,
    enemy: def.id,
    elite: e.elite,
    x: e.x,
    y: e.y,
    cleared: false,
  });

  const luck = Math.max(0, killer.stats.luck);
  if (rng.chance(def.coinChance)) {
    dropCoins(world, e.x, e.y, e.coins + (rng.chance(luck / 200) ? 1 : 0));
  }
  if (rng.chance(FOOD_CHANCE * (1 + luck / 100))) spawnPickup(world, 'food', FOOD_HEAL, e.x, e.y);

  if (def.splitInto) {
    for (let i = 0; i < def.splitInto.count; i++) {
      randomUnit(rng, unit);
      const child = spawnEnemy(
        world,
        def.splitInto.enemy,
        e.x + unit.x * e.radius * 0.5,
        e.y + unit.y * e.radius * 0.5,
        false,
      );
      child.kx = unit.x * SPLIT_POP;
      child.ky = unit.y * SPLIT_POP;
    }
  }
  if (def.goo)
    addGoo(world, e.x, e.y, def.goo.radius * (e.elite ? ELITE.radius : 1), def.goo.duration);
}

/** One weapon hit on one enemy: class, tag and crit bonuses, knockback, life steal. */
export function weaponHit(
  world: World,
  p: Player,
  def: WeaponDef,
  e: Enemy,
  dirX: number,
  dirY: number,
): void {
  const tags = e.def.tags;
  let amount = def.damage * classDamageMultiplier(p, def.class);
  if (tags.includes('undead')) amount *= 1 + p.stats.undeadDamage / 100;
  if (tags.includes('beast')) amount *= 1 + p.stats.beastDamage / 100;
  if (e.elite || tags.includes('tough')) amount *= 1 + p.stats.slayerDamage / 100;
  const crit = world.rng.chance(def.critChance + p.character.critChance + p.stats.critChance / 100);
  if (crit) amount *= def.critMultiplier;

  const push = def.knockback;
  damageEnemy(world, e, Math.max(1, Math.round(amount)), crit, dirX * push, dirY * push, p, def.id);
  if (p.stats.lifesteal > 0 && world.rng.chance(p.stats.lifesteal / 100)) healPlayer(world, p, 1);
}

/** Damages every enemy within `radius`, pushing them away from the centre. */
export function explode(
  world: World,
  p: Player,
  def: WeaponDef,
  x: number,
  y: number,
  radius: number,
): void {
  world.events.push({ type: 'explosion', weapon: def.id, x, y, radius });
  const near = world.grid.query(x, y, radius + MAX_ENEMY_RADIUS, explosionNear);
  for (const index of near) {
    const e = world.enemies[index];
    if (!e?.alive) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const reach = radius + e.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 > reach * reach) continue;
    const d = Math.sqrt(d2);
    weaponHit(world, p, def, e, d > 0.001 ? dx / d : 0, d > 0.001 ? dy / d : 0);
  }
}

export function hurtPlayer(world: World, p: Player, raw: number): void {
  if (world.rng.chance(dodgeChance(p))) {
    p.invulnerable = DODGE_IFRAMES;
    world.events.push({ type: 'playerHit', player: p.id, amount: 0, dodged: true });
    return;
  }
  const amount = Math.max(1, Math.round(raw * armourFactor(p.stats.armour)));
  p.hp -= amount;
  p.invulnerable = HIT_IFRAMES;
  world.events.push({ type: 'playerHit', player: p.id, amount, dodged: false });
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    p.downs++;
    p.vx = p.vy = 0;
    world.events.push({ type: 'playerDeath', player: p.id });
  }
}

export function healPlayer(world: World, p: Player, amount: number): void {
  if (!p.alive || p.hp >= p.maxHp) return;
  const gained = Math.min(amount, p.maxHp - p.hp);
  p.hp += gained;
  world.events.push({ type: 'heal', player: p.id, amount: gained });
}

export function gainXp(world: World, p: Player, amount: number): void {
  p.xp += amount;
  for (;;) {
    const need = xpToNext(p.level);
    if (p.xp < need) return;
    p.xp -= need;
    p.level++;
    p.pendingLevels++;
    recomputeStats(p);
    world.events.push({ type: 'levelUp', player: p.id, level: p.level });
  }
}

/** Splits `value` into a small scatter of coins. */
export function dropCoins(world: World, x: number, y: number, value: number): void {
  if (value <= 0) return;
  const pieces = Math.min(value, 5);
  const base = Math.floor(value / pieces);
  const extra = value % pieces;
  for (let i = 0; i < pieces; i++) spawnPickup(world, 'coin', base + (i < extra ? 1 : 0), x, y);
}

export function spawnPickup(
  world: World,
  kind: PickupKind,
  value: number,
  x: number,
  y: number,
): void {
  if (world.pickups.length >= MAX_PICKUPS) {
    if (kind !== 'coin') return;
    // At the cap, fold the value into a coin that is still lying around.
    for (const pk of world.pickups) {
      if (pk.alive && pk.kind === 'coin' && pk.target < 0) {
        pk.value += value;
        return;
      }
    }
    return;
  }
  const pk = world.pools.pickups.pop() ?? blankPickup();
  randomUnit(world.rng, unit);
  const scatter = world.rng.range(40, 140);
  pk.id = world.nextId++;
  pk.alive = true;
  pk.kind = kind;
  pk.value = value;
  pk.x = pk.prevX = x;
  pk.y = pk.prevY = y;
  pk.vx = unit.x * scatter;
  pk.vy = unit.y * scatter;
  pk.target = -1;
  pk.speed = 0;
  world.pickups.push(pk);
}

function addGoo(world: World, x: number, y: number, radius: number, duration: number): void {
  if (world.goo.length >= MAX_GOO) world.goo.shift();
  const ticks = seconds(duration);
  world.goo.push({ id: world.nextId++, x, y, radius, ticks, duration: ticks });
}

function blankEnemy(): Enemy {
  return {
    id: 0,
    def: ENEMIES.zombie,
    elite: false,
    alive: false,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    hp: 0,
    maxHp: 0,
    radius: 0,
    speed: 0,
    damage: 0,
    mass: 1,
    coins: 0,
    flankSide: 1,
    transformed: false,
    action: 'walk',
    actionTicks: 0,
    cooldown: 0,
    dirX: 0,
    dirY: 0,
  };
}

function blankPickup(): Pickup {
  return {
    id: 0,
    alive: false,
    kind: 'coin',
    value: 0,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    target: -1,
    speed: 0,
  };
}
