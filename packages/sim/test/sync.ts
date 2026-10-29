import { ZONES, type WeaponId } from '@game/content';
import { createWorld, quantizeInput, step, worldHash } from '../src';
import { botInput, botIntermission } from './bot';

/**
 * The cross-engine determinism check for co-op lockstep (PLAN.md §9, 5a): bot
 * runs whose world hash is taken every second of wave time. sync.test.ts
 * records the hashes Node computes; the browser self-test (the game with
 * ?sync) plays the same runs and must get every hash identical.
 */

export interface SyncCase {
  readonly name: string;
  readonly seed: number;
  /** One starting weapon per player. */
  readonly weapons: readonly WeaponId[];
}

export const SYNC_CASES: readonly SyncCase[] = [
  { name: 'Solo run', seed: 11, weapons: ['staff'] },
  { name: 'Party of 4', seed: 2903705189, weapons: ['boomchin', 'shortbow', 'scimitar', 'dagger'] },
];

/** Plays a case to the end, yielding the world hash every 60 ticks and once more at the end. */
export function* syncHashes(c: SyncCase): Generator<number, void> {
  const world = createWorld({
    seed: c.seed,
    zone: ZONES.wolfmoor,
    loadouts: c.weapons.map((w) => [w]),
  });
  for (let guard = 0; guard < 60 * 60 * 30 && world.phase !== 'over'; guard++) {
    if (world.phase === 'intermission') {
      world.players.forEach((_, i) => botIntermission(world, i));
      continue;
    }
    // Quantized like real input, as lockstep will send it.
    step(
      world,
      world.players.map((p) => quantizeInput(botInput(world, p))),
    );
    if (world.tick % 60 === 0) yield worldHash(world);
  }
  yield worldHash(world);
}
