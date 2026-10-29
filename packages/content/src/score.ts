/**
 * Run score (PLAN.md §8): points for kills by toughness (`EnemyDef.points`,
 * elites ×`ELITE.points`), a bonus for each wave survived, and one for winning.
 */
export const SCORE = {
  /** Surviving wave N is worth N × this, scaled by the fraction of HP left at its end. */
  waveBonus: 100,
  /** Clearing the zone's last wave. */
  victoryBonus: 2500,
} as const;
