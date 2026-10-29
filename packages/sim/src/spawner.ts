import type { SpawnRule } from '@game/content';
import { seconds } from './constants';
import { spawnEnemy } from './combat';
import { clamp, randomUnit, type Vec } from './math';
import { enemyCap, spawnRate } from './party';
import type { World } from './world';

/** Spawn markers flash this long before the enemy appears. */
const MARKER_TICKS = seconds(0.9);
/** New spawns land in this ring around a player (wu). */
const SPAWN_MIN = 380;
const SPAWN_MAX = 620;
/** Never closer than this, even when a wall squashes the ring. */
const SPAWN_SAFE = 260;
const ARENA_MARGIN = 30;
const PACK_SPREAD = 36;
/** No new markers this close to the end of a wave. */
const QUIET_END = seconds(1.5);

const unit: Vec = { x: 0, y: 0 };
const point: Vec = { x: 0, y: 0 };

export function updateSpawner(world: World): void {
  const wave = world.waves[world.wave - 1];
  if (!wave) return;

  if (world.waveTick < world.waveTicks - QUIET_END) {
    wave.spawns.forEach((rule, i) => {
      const next = world.ruleNext[i] ?? Infinity;
      if (world.waveTick < next) return;
      const until = rule.until === undefined ? world.waveTicks : seconds(rule.until);
      if (world.waveTick > until) {
        world.ruleNext[i] = Infinity;
        return;
      }
      spawnRule(world, rule);
      // Bigger parties face a faster horde.
      world.ruleNext[i] = next + Math.max(1, seconds(rule.every / spawnRate(world)));
    });
  }

  let kept = 0;
  for (const m of world.markers) {
    if (--m.ticks > 0) {
      world.markers[kept++] = m;
      continue;
    }
    for (let n = 0; n < m.count; n++) {
      if (m.count === 1) {
        spawnEnemy(world, m.enemy, m.x, m.y, m.elite);
      } else {
        randomUnit(world.rng, unit);
        const r = world.rng.range(0, PACK_SPREAD);
        spawnEnemy(world, m.enemy, m.x + unit.x * r, m.y + unit.y * r, m.elite);
      }
    }
  }
  world.markers.length = kept;
}

function spawnRule(world: World, rule: SpawnRule): void {
  const count = rule.count ?? 1;
  let pending = world.enemies.length;
  for (const m of world.markers) pending += m.count;
  // Elites always get through; fodder waits for room.
  if (!rule.elite && pending + count > enemyCap(world)) return;

  const elite = rule.elite ?? false;
  if (rule.pack) {
    if (findSpawnPoint(world)) addMarker(world, rule, count, elite);
    return;
  }
  for (let n = 0; n < count; n++) {
    if (findSpawnPoint(world)) addMarker(world, rule, 1, elite);
  }
}

function addMarker(world: World, rule: SpawnRule, count: number, elite: boolean): void {
  world.markers.push({
    id: world.nextId++,
    enemy: rule.enemy,
    count,
    elite,
    x: point.x,
    y: point.y,
    ticks: MARKER_TICKS,
  });
}

/** Picks a spot in a ring around a random living player into `point`. */
function findSpawnPoint(world: World): boolean {
  const { rng, arena } = world;
  const alive = world.players.filter((p) => p.alive);
  if (alive.length === 0) return false;
  const anchor = rng.pick(alive);

  for (let attempt = 0; attempt < 8; attempt++) {
    randomUnit(rng, unit);
    const dist = rng.range(SPAWN_MIN, SPAWN_MAX);
    point.x = clamp(anchor.x + unit.x * dist, ARENA_MARGIN, arena.width - ARENA_MARGIN);
    point.y = clamp(anchor.y + unit.y * dist, ARENA_MARGIN, arena.height - ARENA_MARGIN);
    if (farFromPlayers(world, point.x, point.y)) return true;
  }
  return true;
}

function farFromPlayers(world: World, x: number, y: number): boolean {
  for (const p of world.players) {
    if (!p.alive) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy < SPAWN_SAFE * SPAWN_SAFE) return false;
  }
  return true;
}
