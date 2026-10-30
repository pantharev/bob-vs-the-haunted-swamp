import type { Placing } from './store';

/**
 * Where the hiscores live in Redis (PLAN.md §8): a weekly and an all-time
 * board for solo runs, and the same pair for each co-op party size.
 */

/** Bump to start fresh boards, e.g. after a big balance change. */
export const SEASON = 1;
/** Every key the hiscores use starts with this. */
export const KEY_PREFIX = `bob:s${SEASON}`;
/** Weekly boards outlive their week by a while, then expire. */
export const WEEK_TTL = 8 * 7 * 24 * 60 * 60;
/** Rows a board shows. */
export const BOARD_SIZE = 50;

export type BoardId = 'week' | 'all';

/** Players in a run: 1 is solo; 2 to 4 are the co-op boards. */
export type PartySize = 1 | 2 | 3 | 4;
export type TeamSize = Exclude<PartySize, 1>;

export const PARTY_SIZES: readonly PartySize[] = [1, 2, 3, 4];
export const PARTY_BOARD_NAMES: Readonly<Record<PartySize, string>> = {
  1: 'Solo',
  2: 'Duo',
  3: 'Trio',
  4: 'Squad',
};

export function isTeamSize(size: number): size is TeamSize {
  return size === 2 || size === 3 || size === 4;
}

/** An anonymous id per browser (see the client's playerId). */
export const PLAYER_ID_PATTERN = /^[0-9a-f]{32}$/;

/** The Redis key of a board. Solo boards keep the keys they had before co-op. */
export function boardKey(board: BoardId, size: PartySize, now: number): string {
  const base = size === 1 ? KEY_PREFIX : `${KEY_PREFIX}:party${size}`;
  return board === 'all' ? `${base}:all` : `${base}:week:${isoWeek(now)}`;
}

/** ISO 8601 week of a UTC time, like "2026-W44". Weeks start on Monday. */
export function isoWeek(ms: number): string {
  const date = new Date(ms);
  const day = date.getUTCDay() || 7;
  // The Thursday of this week decides which year the week belongs to.
  const thursday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 4 - day);
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / 86_400_000 / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Where a run placed on one board, as players see it. */
export interface BoardPlacing {
  /** 1-based. */
  readonly rank: number;
  /** The best score on this board for the same player or team (this run or an earlier one). */
  readonly best: number;
  readonly improved: boolean;
}

export function toPlacing(p: Placing): BoardPlacing {
  return { rank: p.rank + 1, best: p.best, improved: p.improved };
}
