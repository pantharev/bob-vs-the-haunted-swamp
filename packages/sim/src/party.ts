import { COOP_SCALING, MAX_PARTY, REVIVE } from '@game/content';
import { seconds } from './constants';
import type { Player, World } from './world';

/**
 * Co-op rules (PLAN.md §9): the horde scales with the party, and a downed
 * player gets back up when a teammate stands next to them.
 */

const REVIVE_TICKS = seconds(REVIVE.seconds);

function size(world: World): number {
  return Math.min(Math.max(world.players.length, 1), MAX_PARTY) - 1;
}

/** Spawn rules fire this many times as often. */
export function spawnRate(world: World): number {
  return COOP_SCALING.spawnRate[size(world)]!;
}

export function enemyCap(world: World): number {
  return COOP_SCALING.enemyCap[size(world)]!;
}

/** Extra HP for the party on top of the wave's own scaling. */
export function partyHp(world: World, elite: boolean): number {
  return (elite ? COOP_SCALING.eliteHp : COOP_SCALING.enemyHp)[size(world)]!;
}

/** Downed players fill their revive bar while a standing teammate is close, and drain it otherwise. */
export function updateRevives(world: World): void {
  if (world.players.length < 2) return;
  const r2 = REVIVE.radius * REVIVE.radius;
  for (const p of world.players) {
    if (p.alive) continue;
    let helped = false;
    for (const q of world.players) {
      if (!q.alive) continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (dx * dx + dy * dy <= r2) {
        helped = true;
        break;
      }
    }
    p.revive = helped ? p.revive + 1 : Math.max(0, p.revive - 1);
    if (p.revive >= REVIVE_TICKS) {
      standUp(p);
      p.invulnerable = seconds(REVIVE.iframes);
      world.events.push({ type: 'playerRevive', player: p.id });
    }
  }
}

/** Back on their feet with REVIVE.hp of their max HP. */
export function standUp(p: Player): void {
  p.alive = true;
  p.revive = 0;
  p.hp = Math.max(1, Math.ceil(p.maxHp * REVIVE.hp));
}

/** Fraction 0..1 of a downed player's revive bar, for the view. */
export function reviveProgress(p: Player): number {
  return Math.min(1, p.revive / REVIVE_TICKS);
}
