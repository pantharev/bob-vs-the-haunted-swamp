export const TICK_RATE = 60;
/** Fixed sim timestep (s). Never varies: determinism depends on it. */
export const DT = 1 / TICK_RATE;

/** Alive-enemy cap (PLAN.md §5 performance budget). Spawns pause above it. */
export const MAX_ENEMIES = 300;
/** Above this, new coins merge into an existing one. */
export const MAX_PICKUPS = 150;
export const MAX_GOO = 40;
/** Upper bound on any enemy's radius, for padding grid queries. */
export const MAX_ENEMY_RADIUS = 32;

export function seconds(s: number): number {
  return Math.round(s * TICK_RATE);
}
