import { describe, expect, it } from 'vitest';
import { boardKey, isoWeek } from '../src/boards';
import { MemoryStore } from '../src/store';
import { readTeamBoard, recordTeam, teamMember, type TeamSummary } from '../src/team';

const NOW = Date.UTC(2026, 9, 30, 12);
const [A, B, C] = ['a', 'b', 'c'].map((c) => c.repeat(32)) as [string, string, string];

function run(score: number, names: string[]): Omit<TeamSummary, 'date'> {
  return {
    team: names.map((name) => ({ name, weapon: 'staff' })),
    score,
    wave: 3,
    won: false,
    kills: 40,
    ticks: 5000,
  };
}

describe('boards', () => {
  it('keeps the solo keys and gives each party size its own', () => {
    expect(boardKey('all', 1, NOW)).toBe('bob:s1:all');
    expect(boardKey('week', 1, NOW)).toBe('bob:s1:week:2026-W44');
    expect(boardKey('all', 2, NOW)).toBe('bob:s1:party2:all');
    expect(boardKey('week', 4, NOW)).toBe('bob:s1:party4:week:2026-W44');
  });

  it('names ISO weeks', () => {
    expect(isoWeek(Date.UTC(2026, 9, 28))).toBe('2026-W44');
    expect(isoWeek(Date.UTC(2021, 0, 1))).toBe('2020-W53');
    expect(isoWeek(Date.UTC(2024, 11, 30))).toBe('2025-W01');
    // Weeks start on Monday.
    expect(isoWeek(Date.UTC(2026, 10, 1, 23, 59))).toBe('2026-W44');
    expect(isoWeek(Date.UTC(2026, 10, 2))).toBe('2026-W45');
  });
});

describe('team boards', () => {
  it('knows a team whatever the seat order', () => {
    expect(teamMember([B, A])).toBe(teamMember([A, B]));
    expect(teamMember([A, B])).not.toBe(teamMember([A, C]));
  });

  it("keeps each team's best run, with the names from that run", async () => {
    const store = new MemoryStore(() => NOW);
    const first = await recordTeam(store, [A, B], run(800, ['Ann', 'Bo']), NOW);
    expect(first).toEqual({
      week: { rank: 1, best: 800, improved: true },
      all: { rank: 1, best: 800, improved: true },
    });
    // Same players, other seats, worse run: the best stands.
    const worse = await recordTeam(store, [B, A], run(300, ['Bo', 'Ann']), NOW);
    expect(worse.all).toEqual({ rank: 1, best: 800, improved: false });
    await recordTeam(store, [A, C], run(1000, ['Ann', 'Cy']), NOW);
    const better = await recordTeam(store, [A, B], run(1500, ['Ann', 'Bob']), NOW);
    expect(better.all).toEqual({ rank: 1, best: 1500, improved: true });

    const board = await readTeamBoard(store, 'all', 2, B, NOW);
    expect(board.entries.map((e) => [e.rank, e.score, e.you])).toEqual([
      [1, 1500, true],
      [2, 1000, false],
    ]);
    expect(board.entries[0]).toMatchObject({
      team: [
        { name: 'Ann', weapon: 'staff' },
        { name: 'Bob', weapon: 'staff' },
      ],
      wave: 3,
      kills: 40,
      date: new Date(NOW).toISOString(),
    });
    expect((await readTeamBoard(store, 'all', 2, null, NOW)).entries.some((e) => e.you)).toBe(
      false,
    );
  });

  it('keeps party sizes apart, and has no board for one player', async () => {
    const store = new MemoryStore(() => NOW);
    await recordTeam(store, [A, B, C], run(700, ['Ann', 'Bo', 'Cy']), NOW);
    expect((await readTeamBoard(store, 'week', 3, A, NOW)).entries).toHaveLength(1);
    expect((await readTeamBoard(store, 'week', 2, A, NOW)).entries).toHaveLength(0);
    await expect(recordTeam(store, [A], run(100, ['Ann']), NOW)).rejects.toThrow(/party of 1/);
  });
});
