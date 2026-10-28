import type { EnemyId } from './enemies';

/**
 * Wave tables (PLAN.md §2). Each rule spawns `count` enemies every `every`
 * seconds between `from` and `until`. A `pack` arrives together at one spot.
 */

export interface SpawnRule {
  readonly enemy: EnemyId;
  /** Seconds between spawns. */
  readonly every: number;
  readonly count?: number;
  /** First spawn time (s into the wave). Default 0. */
  readonly from?: number;
  /** No spawns after this time (s). Default: the whole wave. */
  readonly until?: number;
  readonly pack?: boolean;
  readonly elite?: boolean;
}

export interface WaveDef {
  /** Seconds. */
  readonly duration: number;
  readonly hpScale: number;
  readonly damageScale: number;
  readonly spawns: readonly SpawnRule[];
}

/** A rule that fires exactly once at `at` seconds. */
function once(enemy: EnemyId, at: number, options: Partial<SpawnRule> = {}): SpawnRule {
  return { enemy, every: 1e9, from: at, ...options };
}

export const WOLFMOOR_WAVES: readonly WaveDef[] = [
  {
    duration: 20,
    hpScale: 1,
    damageScale: 1,
    spawns: [
      { enemy: 'zombie', every: 0.9 },
      { enemy: 'zombie', every: 5, count: 3, from: 6, pack: true },
    ],
  },
  {
    duration: 25,
    hpScale: 1.15,
    damageScale: 1.1,
    spawns: [
      { enemy: 'zombie', every: 0.9 },
      { enemy: 'hand', every: 9, count: 6, from: 5, pack: true },
    ],
  },
  {
    duration: 30,
    hpScale: 1.3,
    damageScale: 1.2,
    spawns: [
      { enemy: 'zombie', every: 0.85 },
      { enemy: 'hand', every: 8, count: 7, from: 4, pack: true },
      { enemy: 'slime', every: 5, from: 6 },
    ],
  },
  {
    duration: 35,
    hpScale: 1.45,
    damageScale: 1.3,
    spawns: [
      { enemy: 'zombie', every: 0.75 },
      { enemy: 'hand', every: 7, count: 8, from: 4, pack: true },
      { enemy: 'slime', every: 4.5, from: 3 },
      { enemy: 'werewolf', every: 12, from: 10 },
    ],
  },
  {
    duration: 40,
    hpScale: 1.6,
    damageScale: 1.4,
    spawns: [
      { enemy: 'zombie', every: 0.65 },
      { enemy: 'hand', every: 7, count: 8, from: 3, pack: true },
      { enemy: 'slime', every: 4 },
      { enemy: 'werewolf', every: 10, from: 6 },
      once('werewolf', 18, { elite: true }),
    ],
  },
  {
    duration: 45,
    hpScale: 1.8,
    damageScale: 1.5,
    spawns: [
      { enemy: 'zombie', every: 0.6 },
      { enemy: 'zombie', every: 6, count: 5, from: 5, pack: true },
      { enemy: 'hand', every: 6, count: 9, from: 3, pack: true },
      { enemy: 'slime', every: 3.5 },
      { enemy: 'werewolf', every: 8, from: 4 },
    ],
  },
  {
    duration: 50,
    hpScale: 2,
    damageScale: 1.6,
    spawns: [
      { enemy: 'zombie', every: 0.55 },
      { enemy: 'zombie', every: 6, count: 5, from: 5, pack: true },
      { enemy: 'hand', every: 5.5, count: 10, from: 3, pack: true },
      { enemy: 'slime', every: 3 },
      { enemy: 'werewolf', every: 7, from: 3 },
    ],
  },
  {
    duration: 55,
    hpScale: 2.25,
    damageScale: 1.75,
    spawns: [
      { enemy: 'zombie', every: 0.5 },
      { enemy: 'zombie', every: 5, count: 6, from: 4, pack: true },
      { enemy: 'hand', every: 5, count: 10, from: 2, pack: true },
      { enemy: 'slime', every: 2.8 },
      { enemy: 'werewolf', every: 6, from: 3 },
      once('werewolf', 28, { elite: true }),
    ],
  },
  {
    duration: 60,
    hpScale: 2.5,
    damageScale: 1.9,
    spawns: [
      { enemy: 'zombie', every: 0.45 },
      { enemy: 'zombie', every: 5, count: 6, from: 4, pack: true },
      { enemy: 'hand', every: 4.5, count: 11, from: 2, pack: true },
      { enemy: 'slime', every: 2.5 },
      { enemy: 'werewolf', every: 5, from: 2 },
    ],
  },
  {
    duration: 60,
    hpScale: 2.8,
    damageScale: 2,
    spawns: [
      { enemy: 'zombie', every: 0.4 },
      { enemy: 'zombie', every: 4, count: 7, from: 3, pack: true },
      { enemy: 'hand', every: 4, count: 12, from: 2, pack: true },
      { enemy: 'slime', every: 2.2 },
      { enemy: 'werewolf', every: 4.5, from: 2 },
      once('werewolf', 10, { elite: true }),
      once('werewolf', 40, { elite: true }),
    ],
  },
];
