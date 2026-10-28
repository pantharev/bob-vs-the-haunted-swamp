import type { Rng } from './rng';

/**
 * Sim math avoids Math.sin/cos/atan2/exp/pow: their results may differ in the
 * last bit between JS engines, which would break replay checks. sqrt and
 * basic arithmetic are exactly specified.
 */

export interface Vec {
  x: number;
  y: number;
}

/** Uniformly random direction, by rejection sampling in the unit square. */
export function randomUnit(rng: Rng, out: Vec): Vec {
  for (;;) {
    const x = rng.range(-1, 1);
    const y = rng.range(-1, 1);
    const d2 = x * x + y * y;
    if (d2 > 0.0001 && d2 <= 1) {
      const d = Math.sqrt(d2);
      out.x = x / d;
      out.y = y / d;
      return out;
    }
  }
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
