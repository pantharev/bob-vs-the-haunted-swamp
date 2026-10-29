import { COOP_SCALING, MAX_PARTY, WEAPON_IDS, ZONES, type WeaponId } from '@game/content';
import { describe, expect, it } from 'vitest';
import { createWorld, quantizeInput, step } from '../src';
import { botInput, botIntermission } from './bot';

/**
 * Co-op balance (PLAN.md §9): bot parties of 1–4 on the same seeds. COOP_SCALING
 * is tuned until bigger parties win about as often, and lose about as much HP
 * per wave, as a solo bot. Slow, so opt-in:
 *   BALANCE=1 npx vitest run party.balance        (BALANCE=200 for 200 seeds)
 */

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const SEEDS = Number(env?.BALANCE) > 1 ? Number(env?.BALANCE) : 50;
// SCALING='{"enemyHp":[1,1.05,1.1,1.15]}' tries other numbers without editing content.
if (env?.SCALING) Object.assign(COOP_SCALING, JSON.parse(env.SCALING));

function loadout(seed: number, players: number): WeaponId[] {
  return Array.from(
    { length: players },
    (_, i) => WEAPON_IDS[(seed * 7 + i * 3) % WEAPON_IDS.length]!,
  );
}

function playParty(seed: number, players: number) {
  const world = createWorld({
    seed,
    zone: ZONES.wolfmoor,
    loadouts: loadout(seed, players).map((w) => [w]),
  });
  let hpLost = 0;
  let waveEnds = 0;
  let downs = 0;
  let revives = 0;
  for (let guard = 0; guard < 60 * 60 * 30 && world.phase !== 'over'; guard++) {
    if (world.phase === 'intermission') {
      world.players.forEach((_, i) => botIntermission(world, i));
      continue;
    }
    step(
      world,
      world.players.map((p) => quantizeInput(botInput(world, p))),
    );
    for (const e of world.events) {
      if (e.type === 'playerDeath') downs++;
      if (e.type === 'playerRevive') revives++;
      if (e.type === 'waveEnd') {
        for (const p of world.players) hpLost += 1 - (p.alive ? p.hp / p.maxHp : 0);
        waveEnds += world.players.length;
      }
    }
  }
  return {
    won: world.outcome === 'victory',
    wave: world.wave,
    hpLost: waveEnds ? hpLost / waveEnds : 1,
    downs,
    revives,
    killsEach: world.stats.kills / players,
    coinsEach: world.stats.coinsCollected / players,
    peakSpawnPressure: world.enemies.length,
  };
}

describe.skipIf(!env?.BALANCE)('co-op balance', () => {
  it(`compares parties of 1–${MAX_PARTY} over ${SEEDS} seeds`, () => {
    const rows = [];
    for (let players = 1; players <= MAX_PARTY; players++) {
      const runs = Array.from({ length: SEEDS }, (_, i) => playParty(1000 + i, players));
      const mean = (f: (r: (typeof runs)[number]) => number) =>
        runs.reduce((a, r) => a + f(r), 0) / runs.length;
      rows.push({
        players,
        winRate: `${Math.round(mean((r) => (r.won ? 1 : 0)) * 100)}%`,
        avgWave: mean((r) => r.wave).toFixed(1),
        hpLostPerWave: `${Math.round(mean((r) => r.hpLost) * 100)}%`,
        downs: mean((r) => r.downs).toFixed(1),
        revives: mean((r) => r.revives).toFixed(1),
        killsEach: Math.round(mean((r) => r.killsEach)),
        coinsEach: Math.round(mean((r) => r.coinsEach)),
      });
    }
    console.table(rows);
    expect(rows).toHaveLength(MAX_PARTY);
  }, 3_600_000);
});
