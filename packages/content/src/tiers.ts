/**
 * Metal tiers (PLAN.md §13). Every standard weapon comes in all seven; a tier
 * is a colour and a set of multipliers, not new art. Two copies of the same
 * weapon at the same tier merge into one of the next tier. Each step is worth
 * about ×1.5 (damage times attack speed), so a merge trades a little total
 * power for a free slot.
 */

export type Tier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TierDef {
  readonly tier: Tier;
  readonly name: string;
  /** Multiplies the weapon's damage. */
  readonly damage: number;
  /** Multiplies the weapon's attack rate. */
  readonly attackSpeed: number;
  /**
   * Multiplies the weapon's shop price (and so its sell price). Rises slower
   * than the power, or later shops would be out of reach (bot sweeps, 2026-10-31).
   */
  readonly price: number;
  /** For cards, slots and attack effects. */
  readonly color: number;
}

export const TIERS: Readonly<Record<Tier, TierDef>> = {
  1: { tier: 1, name: 'Bronze', damage: 1, attackSpeed: 1, price: 1, color: 0xc0804a },
  2: { tier: 2, name: 'Iron', damage: 1.45, attackSpeed: 1.05, price: 1.35, color: 0x9a9ea6 },
  3: { tier: 3, name: 'Steel', damage: 2.1, attackSpeed: 1.1, price: 1.75, color: 0xd6dee6 },
  4: { tier: 4, name: 'Mithril', damage: 3, attackSpeed: 1.15, price: 2.2, color: 0x8a84f0 },
  5: { tier: 5, name: 'Adamant', damage: 4.2, attackSpeed: 1.2, price: 2.7, color: 0x5cbf74 },
  6: { tier: 6, name: 'Runic', damage: 5.9, attackSpeed: 1.25, price: 3.3, color: 0x4fd0e0 },
  7: { tier: 7, name: 'Wyrmsteel', damage: 8.2, attackSpeed: 1.3, price: 4, color: 0xe8483a },
};

export const MAX_TIER: Tier = 7;
/** The shop never sells above this; the top tier comes only from merging (or, later, chests). */
export const SHOP_MAX_TIER: Tier = 6;

/**
 * The tier shop weapons centre on in the shop after `wave`: Bronze after
 * waves 1–2, Iron 3–4, Steel 5–6, Mithril 7–8, Adamant 9 onwards.
 */
export function shopTier(wave: number): Tier {
  return Math.max(1, Math.min(5, 1 + Math.floor((wave - 1) / 2))) as Tier;
}

/** Chances for a shop weapon to roll off its wave's tier. Luck raises the upward ones. */
export const TIER_ROLL = { down: 0.2, up: 0.15, upTwo: 0.03 } as const;

/** "Mithril scimitar". */
export function tieredName(tier: Tier, weaponName: string): string {
  return `${TIERS[tier].name} ${weaponName.charAt(0).toLowerCase()}${weaponName.slice(1)}`;
}
