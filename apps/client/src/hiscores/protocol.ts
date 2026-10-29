import type { WeaponId } from '@game/content';
import type { Replay } from '@game/sim';

/** Request and response shapes shared by the hiscores client and the API in ../../server. */

export type BoardId = 'week' | 'all';

export interface TicketRequest {
  readonly player: string;
}

/** A server-chosen seed for one ranked run. */
export interface TicketResponse {
  readonly ticket: string;
  readonly seed: number;
}

export interface RunSubmission {
  readonly ticket: string;
  readonly player: string;
  readonly name: string;
  /** Hash of the sim and content sources the run was played on. */
  readonly rules: string;
  /** What the client scored; the server re-runs the replay and must get the same. */
  readonly score: number;
  readonly replay: Replay;
}

export interface BoardPlacing {
  /** 1-based. */
  readonly rank: number;
  /** The player's best score on this board (this run or an earlier one). */
  readonly best: number;
  readonly improved: boolean;
}

export interface SubmitResponse {
  readonly score: number;
  readonly boards: Readonly<Record<BoardId, BoardPlacing>>;
}

/** One run as the leaderboard keeps it. */
export interface RunSummary {
  readonly name: string;
  readonly score: number;
  readonly wave: number;
  readonly won: boolean;
  readonly weapon: WeaponId;
  readonly kills: number;
  readonly level: number;
  /** Wave time played. */
  readonly ticks: number;
  /** ISO timestamp. */
  readonly date: string;
}

export interface HiscoreEntry extends RunSummary {
  readonly rank: number;
}

export interface BoardResponse {
  readonly board: BoardId;
  readonly entries: readonly HiscoreEntry[];
  /** The asking player's own entry, if they are on this board. */
  readonly you: HiscoreEntry | null;
}

export interface ApiError {
  readonly error: string;
}

export const NAME_MAX = 16;
/** Letters, digits, spaces, hyphens and underscores; no leading, trailing or double spaces. */
export const NAME_PATTERN = /^[\p{L}\p{N}_-]+( [\p{L}\p{N}_-]+)*$/u;
export const PLAYER_ID_PATTERN = /^[0-9a-f]{32}$/;
