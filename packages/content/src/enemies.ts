/**
 * Bestiary (PLAN.md §3). Phase 1 covers Zone 1: zombie, crawling hand, bog
 * slime and werewolf. Stats are wave-1 values; waves scale HP and damage.
 */

export type EnemyId = 'zombie' | 'hand' | 'slime' | 'slimeMedium' | 'slimeSmall' | 'werewolf';
export type EnemyTag = 'undead' | 'beast' | 'tough';
export type EnemyBehaviour = 'chase' | 'flank' | 'werewolf';

export interface WerewolfDef {
  /** Transforms below this fraction of max HP. */
  readonly transformBelow: number;
  readonly wolfSpeed: number;
  /** Starts a lunge when Bob is closer than this (wu). */
  readonly lungeTrigger: number;
  /** Red-flash warning before the lunge (s). */
  readonly telegraph: number;
  readonly lungeSpeed: number;
  readonly lungeTime: number;
  readonly lungeCooldown: number;
}

export interface EnemyDef {
  readonly id: EnemyId;
  readonly name: string;
  readonly hp: number;
  /** wu/s */
  readonly speed: number;
  readonly radius: number;
  /** Contact damage. */
  readonly damage: number;
  /** Coins dropped on death, with `coinChance` probability. */
  readonly coins: number;
  readonly coinChance: number;
  /** Score for killing one (PLAN.md §8). Elites are worth `ELITE.points` times this. */
  readonly points: number;
  /** Knockback resistance (1 = normal). */
  readonly mass: number;
  readonly tags: readonly EnemyTag[];
  readonly behaviour: EnemyBehaviour;
  readonly splitInto?: { readonly enemy: EnemyId; readonly count: number };
  /** Slowing puddle left on death. */
  readonly goo?: { readonly radius: number; readonly duration: number };
  readonly werewolf?: WerewolfDef;
}

export const ENEMIES: Readonly<Record<EnemyId, EnemyDef>> = {
  zombie: {
    id: 'zombie',
    name: 'Zombie',
    hp: 12,
    speed: 62,
    radius: 15,
    damage: 4,
    coins: 1,
    coinChance: 1,
    points: 10,
    mass: 1,
    tags: ['undead'],
    behaviour: 'chase',
  },
  hand: {
    id: 'hand',
    name: 'Crawling hand',
    hp: 4,
    speed: 135,
    radius: 9,
    damage: 2,
    coins: 1,
    coinChance: 0.6,
    points: 5,
    mass: 0.6,
    tags: ['undead'],
    behaviour: 'flank',
  },
  slime: {
    id: 'slime',
    name: 'Bog slime',
    hp: 18,
    speed: 50,
    radius: 20,
    damage: 4,
    coins: 1,
    coinChance: 1,
    points: 15,
    mass: 1.5,
    tags: [],
    behaviour: 'chase',
    splitInto: { enemy: 'slimeMedium', count: 2 },
    goo: { radius: 40, duration: 4 },
  },
  slimeMedium: {
    id: 'slimeMedium',
    name: 'Bog slime',
    hp: 8,
    speed: 66,
    radius: 14,
    damage: 3,
    coins: 1,
    coinChance: 1,
    points: 5,
    mass: 1,
    tags: [],
    behaviour: 'chase',
    splitInto: { enemy: 'slimeSmall', count: 2 },
    goo: { radius: 30, duration: 3.5 },
  },
  slimeSmall: {
    id: 'slimeSmall',
    name: 'Bog slime',
    hp: 3,
    speed: 84,
    radius: 9,
    damage: 2,
    coins: 1,
    coinChance: 0.5,
    points: 2,
    mass: 0.6,
    tags: [],
    behaviour: 'chase',
    goo: { radius: 20, duration: 3 },
  },
  werewolf: {
    id: 'werewolf',
    name: 'Werewolf',
    hp: 40,
    speed: 72,
    radius: 17,
    damage: 6,
    coins: 3,
    coinChance: 1,
    points: 50,
    mass: 2,
    tags: ['beast', 'tough'],
    behaviour: 'werewolf',
    werewolf: {
      transformBelow: 0.5,
      wolfSpeed: 112,
      lungeTrigger: 240,
      telegraph: 0.6,
      lungeSpeed: 560,
      lungeTime: 0.32,
      lungeCooldown: 2.2,
    },
  },
};

/** Elites are bigger, tougher versions of a normal enemy. */
export const ELITE = {
  hp: 5,
  radius: 1.4,
  damage: 1.5,
  coins: 4,
  mass: 3,
  points: 10,
} as const;
