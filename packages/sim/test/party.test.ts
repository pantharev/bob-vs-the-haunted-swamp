import { COOP_SCALING, ENEMIES, REVIVE, ZONES } from '@game/content';
import { describe, expect, it } from 'vitest';
import { applyAction, createWorld, NEUTRAL_INPUT, step, type World } from '../src';
import { seconds } from '../src/constants';
import { spawnEnemy } from '../src/combat';

const zone = ZONES.wolfmoor;

function party(size: number): World {
  return createWorld({
    seed: 7,
    zone,
    loadouts: Array.from({ length: size }, () => ['dagger'] as const),
  });
}

const idle = (world: World) => world.players.map(() => NEUTRAL_INPUT);

/** Takes a player out of the fight the way a fatal hit does. */
function down(world: World, i: number): void {
  const p = world.players[i]!;
  p.alive = false;
  p.hp = 0;
}

describe('party scaling', () => {
  it('fires spawn rules faster for bigger parties', () => {
    const rule = zone.waves[0]!.spawns[0]!;
    for (const size of [1, 2, 4]) {
      const world = party(size);
      const first = world.ruleNext[0]!;
      while (world.ruleNext[0] === first) step(world, idle(world));
      const rate = COOP_SCALING.spawnRate[size - 1]!;
      expect(world.ruleNext[0]! - first).toBe(Math.max(1, seconds(rule.every / rate)));
    }
  });

  it('gives enemies and elites extra HP for the party', () => {
    for (const size of [1, 3]) {
      const world = party(size);
      const zombie = spawnEnemy(world, 'zombie', 100, 100, false);
      const elite = spawnEnemy(world, 'werewolf', 100, 100, true);
      const wave = zone.waves[0]!;
      expect(zombie.maxHp).toBe(
        Math.round(ENEMIES.zombie.hp * wave.hpScale * COOP_SCALING.enemyHp[size - 1]!),
      );
      expect(elite.maxHp).toBe(
        Math.round(ENEMIES.werewolf.hp * wave.hpScale * 5 * COOP_SCALING.eliteHp[size - 1]!),
      );
    }
  });
});

describe('downed and revived', () => {
  it('a teammate standing close for 3 s revives at half HP', () => {
    const world = party(2);
    down(world, 1);
    const [helper, downed] = world.players as [World['players'][number], World['players'][number]];
    downed.x = helper.x + 40;
    downed.y = helper.y;
    let revivedAt = -1;
    for (let t = 0; t < seconds(REVIVE.seconds) + 5 && revivedAt < 0; t++) {
      step(world, idle(world));
      if (world.events.some((e) => e.type === 'playerRevive' && e.player === 1)) revivedAt = t + 1;
    }
    expect(revivedAt).toBe(seconds(REVIVE.seconds));
    expect(downed.alive).toBe(true);
    expect(downed.hp).toBe(Math.ceil(downed.maxHp * REVIVE.hp));
    expect(downed.invulnerable).toBeGreaterThan(0);
  });

  it('drains revive progress when nobody is near', () => {
    const world = party(2);
    down(world, 1);
    const downed = world.players[1]!;
    downed.x = world.players[0]!.x + 40;
    for (let t = 0; t < 60; t++) step(world, idle(world));
    expect(downed.revive).toBe(60);
    downed.x += 500;
    for (let t = 0; t < 30; t++) step(world, idle(world));
    expect(downed.revive).toBe(30);
    expect(downed.alive).toBe(false);
  });

  it('brings anyone still down back for the shop and the next wave, at half HP', () => {
    const world = party(2);
    down(world, 1);
    world.players[1]!.x += 600;
    world.waveTick = world.waveTicks - 1;
    step(world, idle(world));
    expect(world.phase).toBe('intermission');
    const [first, returner] = world.players as [World['players'][number], World['players'][number]];
    expect(returner.alive).toBe(true);
    expect(returner.returning).toBe(true);
    expect(['levelUp', 'shop']).toContain(returner.intermission);
    for (const [i, p] of world.players.entries()) {
      while (p.intermission === 'levelUp')
        applyAction(world, i, { type: 'chooseUpgrade', index: 0 });
      applyAction(world, i, { type: 'ready' });
    }
    expect(world.phase).toBe('wave');
    expect(world.wave).toBe(2);
    expect(first.hp).toBe(first.maxHp);
    expect(returner.hp).toBe(Math.ceil(returner.maxHp * REVIVE.hp));
    expect(returner.returning).toBe(false);
  });

  it('only ends the run when the whole party is down', () => {
    const world = party(3);
    down(world, 0);
    down(world, 1);
    step(world, idle(world));
    expect(world.phase).toBe('wave');
    down(world, 2);
    step(world, idle(world));
    expect(world.phase).toBe('over');
    expect(world.outcome).toBe('defeat');
  });

  it('never revives anyone in a solo run', () => {
    const world = party(1);
    down(world, 0);
    step(world, idle(world));
    expect(world.outcome).toBe('defeat');
    expect(world.players[0]!.revive).toBe(0);
  });
});
