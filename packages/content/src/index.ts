/**
 * Game data tables. Every player-facing name lives in this package so the
 * "inspired by, never the original" naming rule (PLAN.md §12) stays a
 * one-package concern.
 *
 * Units: world units (wu). The camera fits ~640 wu across the screen's short side.
 */

export interface CharacterDef {
  readonly id: string;
  readonly name: string;
  /** Collision radius (wu). */
  readonly radius: number;
  /** Top speed (wu/s). */
  readonly moveSpeed: number;
  /** On-screen sprite height (wu), feet to top of hair. */
  readonly spriteHeight: number;
}

export interface ZoneDef {
  readonly id: string;
  readonly name: string;
  /** Arena size (wu). */
  readonly width: number;
  readonly height: number;
}

export const BOB: CharacterDef = {
  id: 'bob',
  name: 'Bob',
  radius: 14,
  moveSpeed: 220,
  spriteHeight: 72,
};

export const ZONES = {
  wolfmoor: {
    id: 'wolfmoor',
    name: 'Wolfmoor Outskirts',
    width: 2000,
    height: 2000,
  },
} as const satisfies Record<string, ZoneDef>;

export type ZoneId = keyof typeof ZONES;
