/**
 * Co-op (PLAN.md §9). Each player brings their own weapons, so the horde grows
 * with the party: arrays are indexed by party size − 1. Tuned with bot parties
 * until 2–4 bots win about as often, and lose about as much HP, as a solo bot
 * (2026-10-29, 100 seeds: wins 37% solo, 38% / 29% / 30% for 2 / 3 / 4 players,
 * 23–25% HP lost per wave for all). Re-check: BALANCE=100 npx vitest run party.balance --silent=false
 */
export const MAX_PARTY = 4;

export const COOP_SCALING = {
  /** Spawn rules fire this many times as often. */
  spawnRate: [1, 1.6, 2.2, 2.8],
  enemyHp: [1, 1.05, 1.1, 1.15],
  /** Everyone shoots the same elite, so its HP scales harder. */
  eliteHp: [1, 1.6, 2.2, 2.8],
  /** Alive-enemy cap: higher for bigger parties, bounded for phones. */
  enemyCap: [300, 340, 380, 420],
} as const;

export const REVIVE = {
  /** A teammate standing this close (wu, centre to centre)… */
  radius: 70,
  /** …for this long gets a downed player back up. Progress drains at the same rate when nobody is near. */
  seconds: 3,
  /** Back up with this fraction of max HP, also for players who return at the next wave. */
  hp: 0.5,
  /** Spawn protection after a revive (s). */
  iframes: 1.5,
} as const;
