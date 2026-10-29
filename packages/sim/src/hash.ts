import type { World } from './world';

/**
 * A 32-bit fingerprint of everything that decides what happens next (PLAN.md §9).
 * Numbers are hashed bit for bit, so two worlds only match if every engine
 * computed every value identically: co-op lockstep checks it every second.
 */
export function worldHash(world: World): number {
  const h = new Hasher();
  h.value(world.tick);
  h.value(world.phase);
  h.value(world.outcome);
  h.value(world.wave);
  h.value(world.waveTick);
  h.value(world.waveTicks);
  h.value(world.ruleNext);
  h.value(world.nextId);
  h.value(world.rng.getState());
  h.value(world.stats);
  h.value(world.players);
  h.value(world.enemies);
  h.value(world.projectiles);
  h.value(world.pickups);
  h.value(world.markers);
  h.value(world.goo);
  return h.digest();
}

/** Content definitions are fixed data: identical everywhere, and slow to walk. */
const SKIP: ReadonlySet<string> = new Set(['def', 'character']);

const f64 = new Float64Array(1);
const words = new Uint32Array(f64.buffer);

class Hasher {
  private h = 0x811c9dc5;

  value(v: unknown): void {
    switch (typeof v) {
      case 'number':
        f64[0] = v;
        this.word(words[0]!);
        this.word(words[1]!);
        return;
      case 'boolean':
        this.word(v ? 1 : 2);
        return;
      case 'string':
        this.word(v.length);
        for (let i = 0; i < v.length; i++) this.word(v.charCodeAt(i));
        return;
      case 'undefined':
        this.word(3);
        return;
      case 'object':
        if (v === null) {
          this.word(4);
        } else if (Array.isArray(v)) {
          this.word(v.length);
          for (const item of v) this.value(item);
        } else {
          // Sorted keys: the same fields in any insertion order hash the same.
          const record = v as Record<string, unknown>;
          for (const key of Object.keys(record).sort()) {
            if (SKIP.has(key)) continue;
            this.value(key);
            this.value(record[key]);
          }
        }
        return;
      default:
        throw new Error(`worldHash can't hash a ${typeof v}`);
    }
  }

  digest(): number {
    let h = this.h;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return h >>> 0;
  }

  private word(w: number): void {
    this.h = Math.imul(this.h ^ w, 0x01000193);
    this.h ^= this.h >>> 15;
  }
}
