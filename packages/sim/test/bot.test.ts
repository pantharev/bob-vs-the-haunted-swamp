import { WEAPON_IDS, ZONES } from '@game/content';
import { describe, expect, it } from 'vitest';
import type { World } from '../src';
import { runBot } from './bot';

const zone = ZONES.wolfmoor;

function assertFinite(world: World): void {
  for (const p of world.players) {
    if (!Number.isFinite(p.x + p.y + p.hp)) throw new Error(`player went non-finite at tick ${world.tick}`);
  }
  for (const e of world.enemies) {
    if (!Number.isFinite(e.x + e.y + e.hp)) throw new Error(`enemy went non-finite at tick ${world.tick}`);
  }
}

describe('headless bot runs', () => {
  it('replays a full run identically from the same seed', () => {
    const a = runBot(1234, zone, ['shortbow']);
    const b = runBot(1234, zone, ['shortbow']);
    expect(a).toEqual(b);
  });

  it('plays every starting weapon to the end of a run without NaNs or stalls', () => {
    const results = WEAPON_IDS.flatMap((weapon) =>
      [11, 22, 33].map((seed) => ({ weapon, seed, ...runBot(seed, zone, [weapon], assertFinite) })),
    );
    console.table(results);
    for (const r of results) {
      expect(r.outcome).not.toBeNull();
      expect(r.wave).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);
});
