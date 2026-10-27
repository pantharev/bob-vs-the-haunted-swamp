import { describe, expect, it } from 'vitest';
import { Rng } from '../src';

function take(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng.next());
}

describe('Rng', () => {
  it('is reproducible from its seed', () => {
    expect(take(new Rng(1234), 1000)).toEqual(take(new Rng(1234), 1000));
  });

  it('diverges for different seeds', () => {
    expect(take(new Rng(1), 8)).not.toEqual(take(new Rng(2), 8));
  });

  it('stays in [0, 1) with a sane mean', () => {
    const values = take(new Rng(99), 20_000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });

  it('int() covers both inclusive bounds and nothing outside', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('resumes exactly from a saved state', () => {
    const rng = new Rng(42);
    take(rng, 17);
    const saved = rng.getState();
    const expected = take(rng, 50);

    const restored = new Rng(0);
    restored.setState(saved);
    expect(take(restored, 50)).toEqual(expected);
  });
});
