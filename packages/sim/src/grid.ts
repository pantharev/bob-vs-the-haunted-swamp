interface Positioned {
  readonly x: number;
  readonly y: number;
}

/**
 * Uniform spatial hash, rebuilt from scratch with a counting sort. Rebuilding
 * 300 entities is cheaper than tracking moves, and it allocates nothing once
 * warmed up. Queries return candidate indices; callers do the exact test.
 */
export class SpatialGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cellStart: Int32Array;
  private readonly cursor: Int32Array;
  private cellOf = new Int32Array(256);
  private items = new Int32Array(256);

  constructor(
    width: number,
    height: number,
    private readonly cellSize = 64,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.cellStart = new Int32Array(this.cols * this.rows + 1);
    this.cursor = new Int32Array(this.cols * this.rows);
  }

  rebuild(entities: readonly Positioned[]): void {
    const n = entities.length;
    if (this.items.length < n) {
      this.items = new Int32Array(n * 2);
      this.cellOf = new Int32Array(n * 2);
    }
    const start = this.cellStart;
    start.fill(0);
    for (let i = 0; i < n; i++) {
      const e = entities[i]!;
      const cell = this.cellIndex(this.col(e.x), this.row(e.y));
      this.cellOf[i] = cell;
      start[cell + 1]!++;
    }
    for (let c = 1; c < start.length; c++) start[c]! += start[c - 1]!;
    this.cursor.set(start.subarray(0, this.cursor.length));
    for (let i = 0; i < n; i++) {
      const cell = this.cellOf[i]!;
      this.items[this.cursor[cell]!++] = i;
    }
  }

  /** Fills `out` with indices of entities in cells overlapping the circle's bounds. */
  query(x: number, y: number, radius: number, out: number[]): number[] {
    out.length = 0;
    const c0 = this.col(x - radius);
    const c1 = this.col(x + radius);
    const r0 = this.row(y - radius);
    const r1 = this.row(y + radius);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.cellIndex(c, r);
        const end = this.cellStart[cell + 1]!;
        for (let k = this.cellStart[cell]!; k < end; k++) out.push(this.items[k]!);
      }
    }
    return out;
  }

  private col(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
  }

  private row(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
  }

  private cellIndex(col: number, row: number): number {
    return row * this.cols + col;
  }
}
