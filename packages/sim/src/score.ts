import { ELITE, SCORE } from '@game/content';
import type { Enemy, World } from './world';

/**
 * The run score (PLAN.md §8). It lives in the sim so the server can recompute
 * it from a replay instead of trusting the number a client sends.
 */

export function scoreKill(world: World, e: Enemy): void {
  add(world, 'killPoints', e.def.points * (e.elite ? ELITE.points : 1));
}

/** Surviving a wave: wave × SCORE.waveBonus, scaled by the players' HP left (dead players count 0). */
export function scoreWave(world: World): void {
  let hpLeft = 0;
  for (const p of world.players) if (p.alive) hpLeft += Math.max(0, p.hp) / p.maxHp;
  add(
    world,
    'waveBonus',
    Math.round((SCORE.waveBonus * world.wave * hpLeft) / world.players.length),
  );
}

export function scoreVictory(world: World): void {
  add(world, 'victoryBonus', SCORE.victoryBonus);
}

function add(
  world: World,
  part: 'killPoints' | 'waveBonus' | 'victoryBonus',
  points: number,
): void {
  world.stats[part] += points;
  world.stats.score += points;
}
