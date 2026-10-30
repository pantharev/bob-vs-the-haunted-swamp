/**
 * The few Redis operations the hiscores need (PLAN.md §8). Upstash backs it in
 * production; MemoryStore backs local dev and the tests.
 */
export interface Store {
  /** SET with an expiry. */
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** GETDEL: read once. */
  take(key: string): Promise<string | null>;
  /** INCR, starting a `ttlSeconds` expiry on the first hit. Returns the new count. */
  count(key: string, ttlSeconds: number): Promise<number>;
  /**
   * Keeps `member`'s best score on a board (a sorted set) and that run's details
   * (a hash beside it). `ttlSeconds` expires the whole board, for weekly boards.
   */
  record(board: string, entry: BoardRecord, ttlSeconds: number | null): Promise<Placing>;
  /** Highest scores first. */
  top(board: string, count: number): Promise<BoardRow[]>;
  find(board: string, member: string): Promise<BoardRow | null>;
}

export interface BoardRecord {
  readonly member: string;
  readonly score: number;
  /** JSON, stored only when the score is a new best. */
  readonly details: string;
}

export interface Placing {
  readonly improved: boolean;
  /** 0-based, best first. */
  readonly rank: number;
  readonly best: number;
}

export interface BoardRow {
  readonly member: string;
  /** 0-based. */
  readonly rank: number;
  readonly score: number;
  readonly details: string | null;
}

/** Where a board keeps each player's best run. */
export const detailsKey = (board: string) => `${board}:runs`;

/** An in-process Store with Redis semantics (ties rank by member, descending, like ZREVRANGE). */
export class MemoryStore implements Store {
  private readonly values = new Map<string, { value: string; expires: number }>();
  private readonly boards = new Map<
    string,
    { scores: Map<string, number>; details: Map<string, string>; expires: number }
  >();

  constructor(private readonly now: () => number = Date.now) {}

  async put(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.values.set(key, { value, expires: this.now() + ttlSeconds * 1000 });
  }

  async take(key: string): Promise<string | null> {
    const entry = this.live(this.values, key);
    this.values.delete(key);
    return entry?.value ?? null;
  }

  async count(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.live(this.values, key);
    const next = Number(entry?.value ?? 0) + 1;
    this.values.set(key, {
      value: String(next),
      expires: entry?.expires ?? this.now() + ttlSeconds * 1000,
    });
    return next;
  }

  async record(board: string, entry: BoardRecord, ttlSeconds: number | null): Promise<Placing> {
    let data = this.live(this.boards, board);
    if (!data) {
      data = { scores: new Map(), details: new Map(), expires: Infinity };
      this.boards.set(board, data);
    }
    if (ttlSeconds !== null) data.expires = this.now() + ttlSeconds * 1000;
    const previous = data.scores.get(entry.member);
    const improved = previous === undefined || entry.score > previous;
    if (improved) {
      data.scores.set(entry.member, entry.score);
      data.details.set(entry.member, entry.details);
    }
    const row = (await this.find(board, entry.member))!;
    return { improved, rank: row.rank, best: row.score };
  }

  async top(board: string, count: number): Promise<BoardRow[]> {
    return this.ranked(board).slice(0, count);
  }

  async find(board: string, member: string): Promise<BoardRow | null> {
    return this.ranked(board).find((row) => row.member === member) ?? null;
  }

  private ranked(board: string): BoardRow[] {
    const data = this.live(this.boards, board);
    if (!data) return [];
    return [...data.scores]
      .sort(([a, x], [b, y]) => y - x || (a < b ? 1 : a > b ? -1 : 0))
      .map(([member, score], rank) => ({
        member,
        rank,
        score,
        details: data.details.get(member) ?? null,
      }));
  }

  private live<T extends { expires: number }>(map: Map<string, T>, key: string): T | undefined {
    const entry = map.get(key);
    if (entry && entry.expires <= this.now()) {
      map.delete(key);
      return undefined;
    }
    return entry;
  }
}
