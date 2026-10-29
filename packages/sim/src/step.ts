import { updateEnemies } from './enemies';
import type { InputCommand } from './input';
import { updatePickups } from './pickups';
import { updateRevives } from './party';
import { contactDamage, updatePlayers } from './player';
import { endRun, endWave } from './run';
import { updateSpawner } from './spawner';
import { updateProjectiles, updateWeapons } from './weapons';
import type { World } from './world';

/** Recycled pools never grow past this. */
const POOL_LIMIT = 512;

/**
 * Advance the world by exactly one tick. `inputs[i]` drives `world.players[i]`.
 * Outside a wave (intermission, run over) the world is frozen.
 */
export function step(world: World, inputs: readonly InputCommand[]): void {
  world.events.length = 0;
  if (world.phase !== 'wave') return;
  world.tick++;
  world.waveTick++;
  world.stats.timeTicks++;

  updatePlayers(world, inputs);
  updateRevives(world);
  updateSpawner(world);
  updateEnemies(world);
  // Enemies moved: rebuild the grid before anything queries positions.
  world.grid.rebuild(world.enemies);
  updateWeapons(world);
  updateProjectiles(world);
  contactDamage(world);
  updatePickups(world);
  updateGoo(world);

  compact(world.enemies, world.pools.enemies);
  compact(world.projectiles, world.pools.projectiles);
  compact(world.pickups, world.pools.pickups);

  if (world.players.every((p) => !p.alive)) endRun(world, 'defeat');
  else if (world.waveTick >= world.waveTicks) endWave(world);
}

function updateGoo(world: World): void {
  let kept = 0;
  for (const g of world.goo) if (--g.ticks > 0) world.goo[kept++] = g;
  world.goo.length = kept;
}

/** Drops dead entries in place (keeping order, so runs stay deterministic). */
function compact<T extends { alive: boolean }>(list: T[], pool: T[]): void {
  let kept = 0;
  for (const item of list) {
    if (item.alive) list[kept++] = item;
    else if (pool.length < POOL_LIMIT) pool.push(item);
  }
  list.length = kept;
}
