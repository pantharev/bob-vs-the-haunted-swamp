/**
 * Who's in a multi-player run, for drawing it (PLAN.md §9): names and colours
 * in player order, and which player is you. Co-op takes colours from lobby
 * seats, so everyone sees the same colour for the same friend.
 */
export interface Party {
  readonly names: readonly string[];
  readonly colors: readonly number[];
  readonly me: number;
}

/** One per lobby seat: gold, blue, green, pink. */
export const SEAT_COLORS = [0xf2c14e, 0x4fa9ff, 0x7be36a, 0xff7a9a] as const;

export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
