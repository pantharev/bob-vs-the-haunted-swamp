/**
 * Game data tables. Every player-facing name lives in this package so the
 * "inspired by, never the original" naming rule (PLAN.md §12) stays a
 * one-package concern.
 *
 * Units: world units (wu). The camera fits ~640 wu across the screen's short side.
 */

import { WOLFMOOR_WAVES, type WaveDef } from './waves';

export * from './enemies';
export * from './items';
export * from './score';
export * from './skills';
export * from './waves';
export * from './weapons';

export interface CharacterDef {
  readonly id: string;
  readonly name: string;
  /** Collision radius (wu). */
  readonly radius: number;
  /** Top speed (wu/s). */
  readonly moveSpeed: number;
  readonly maxHp: number;
  /** Coins within this distance fly to the player (wu). */
  readonly pickupRange: number;
  /** Fraction 0..1, added to every weapon's own crit chance. */
  readonly critChance: number;
  /** On-screen sprite height (wu), feet to top of hair. */
  readonly spriteHeight: number;
}

export interface ZoneDef {
  readonly id: string;
  readonly name: string;
  /** Arena size (wu). */
  readonly width: number;
  readonly height: number;
  readonly waves: readonly WaveDef[];
}

export const BOB: CharacterDef = {
  id: 'bob',
  name: 'Bob',
  radius: 14,
  moveSpeed: 220,
  maxHp: 40,
  pickupRange: 120,
  critChance: 0.05,
  spriteHeight: 72,
};

export const ZONES = {
  wolfmoor: {
    id: 'wolfmoor',
    name: 'Wolfmoor Outskirts',
    width: 2000,
    height: 2000,
    waves: WOLFMOOR_WAVES,
  },
} as const satisfies Record<string, ZoneDef>;

export type ZoneId = keyof typeof ZONES;
