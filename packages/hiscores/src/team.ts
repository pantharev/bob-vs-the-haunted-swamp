import type { WeaponId } from '@game/content';
import {
  BOARD_SIZE,
  boardKey,
  isTeamSize,
  toPlacing,
  WEEK_TTL,
  type BoardId,
  type BoardPlacing,
  type TeamSize,
} from './boards';
import type { BoardRow, Store } from './store';

/**
 * The co-op boards: Duo, Trio and Squad (PLAN.md §9). The co-op server ran
 * the whole run itself, so it records the score directly; nothing to replay.
 * Each team (the same players, whatever the seats) keeps its best run.
 */

/** One co-op run as the boards keep it. */
export interface TeamSummary {
  /** In player order, with each player's starting weapon. */
  readonly team: readonly { readonly name: string; readonly weapon: WeaponId }[];
  readonly score: number;
  readonly wave: number;
  readonly won: boolean;
  readonly kills: number;
  /** Wave time played. */
  readonly ticks: number;
  /** ISO timestamp. */
  readonly date: string;
}

export interface TeamEntry extends TeamSummary {
  readonly rank: number;
  /** The asking player was on this team. */
  readonly you: boolean;
}

export interface TeamBoardResponse {
  readonly board: BoardId;
  readonly size: TeamSize;
  readonly entries: readonly TeamEntry[];
}

export type TeamPlacing = Readonly<Record<BoardId, BoardPlacing>>;

/** A team's member on its boards: its players' ids, sorted, so seat order doesn't matter. */
export function teamMember(players: readonly string[]): string {
  return [...players].sort().join('+');
}

/** Records a finished co-op run on its party size's weekly and all-time boards. */
export async function recordTeam(
  store: Store,
  players: readonly string[],
  run: Omit<TeamSummary, 'date'>,
  now: number,
): Promise<TeamPlacing> {
  const size = run.team.length;
  if (!isTeamSize(size)) throw new Error(`no board for a party of ${size}`);
  const summary: TeamSummary = { ...run, date: new Date(now).toISOString() };
  const entry = { member: teamMember(players), score: run.score, details: JSON.stringify(summary) };
  const [week, all] = await Promise.all([
    store.record(boardKey('week', size, now), entry, WEEK_TTL),
    store.record(boardKey('all', size, now), entry, null),
  ]);
  return { week: toPlacing(week), all: toPlacing(all) };
}

/** A co-op board, best first. `player` marks the teams they played on. */
export async function readTeamBoard(
  store: Store,
  board: BoardId,
  size: TeamSize,
  player: string | null,
  now: number,
): Promise<TeamBoardResponse> {
  const rows = await store.top(boardKey(board, size, now), BOARD_SIZE);
  const entry = (row: BoardRow): TeamEntry[] =>
    row.details
      ? [
          {
            ...(JSON.parse(row.details) as TeamSummary),
            score: row.score,
            rank: row.rank + 1,
            you: player !== null && row.member.split('+').includes(player),
          },
        ]
      : [];
  return { board, size, entries: rows.flatMap(entry) };
}
