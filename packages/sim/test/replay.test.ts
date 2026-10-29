import { ELITE, ENEMIES, SCORE, ZONES, type WeaponId } from '@game/content';
import { describe, expect, it } from 'vitest';
import {
  createWorld,
  quantizeInput,
  ReplayError,
  ReplayRecorder,
  replayRun,
  step,
  type Replay,
  type World,
} from '../src';
import { recordBot as recordBotRun } from './bot';

const zone = ZONES.wolfmoor;

/** A recorded bot run, plus its score parts recomputed from events, independently of the sim's tally. */
function recordBot(seed: number, weapon: WeaponId) {
  let killPoints = 0;
  let waveBonus = 0;
  const run = recordBotRun(seed, zone, weapon, (world) => {
    for (const e of world.events) {
      if (e.type === 'enemyDeath' && !e.cleared) {
        killPoints += ENEMIES[e.enemy].points * (e.elite ? ELITE.points : 1);
      }
      if (e.type === 'waveEnd') {
        const p = world.players[0]!;
        waveBonus += Math.round((SCORE.waveBonus * e.wave * p.hp) / p.maxHp);
      }
    }
  });
  return { ...run, killPoints, waveBonus };
}

function summary(world: World) {
  const p = world.players[0]!;
  return {
    outcome: world.outcome,
    wave: world.wave,
    tick: world.tick,
    stats: world.stats,
    player: { x: p.x, y: p.y, hp: p.hp, level: p.level, coins: p.coins, weapons: p.weapons },
  };
}

describe('score', () => {
  it.each([
    ['staff', 11],
    ['scimitar', 11],
  ] as const)(
    'adds up kills, wave bonuses and the victory bonus (%s, seed %i)',
    (weapon, seed) => {
      const { world, killPoints, waveBonus } = recordBot(seed, weapon);
      const { stats } = world;
      expect(stats.killPoints).toBe(killPoints);
      expect(stats.waveBonus).toBe(waveBonus);
      expect(stats.victoryBonus).toBe(world.outcome === 'victory' ? SCORE.victoryBonus : 0);
      expect(stats.score).toBe(stats.killPoints + stats.waveBonus + stats.victoryBonus);
      expect(stats.score).toBeGreaterThan(0);
    },
    30_000,
  );

  it('pays no wave bonus for the wave Bob dies in', () => {
    // scimitar seed 11 falls on wave 8 (see bot.test.ts), so only waves 1-7 pay.
    const { world, waveBonus } = recordBot(11, 'scimitar');
    expect(world.outcome).toBe('defeat');
    expect(waveBonus).toBeLessThanOrEqual((SCORE.waveBonus * ((world.wave - 1) * world.wave)) / 2);
  }, 30_000);
});

describe('replays', () => {
  it.each([
    ['staff', 11],
    ['shortbow', 22],
    ['dagger', 33],
    ['boomchin', 22],
  ] as const)(
    're-run to the identical end state (%s, seed %i)',
    (weapon, seed) => {
      const { world, replay } = recordBot(seed, weapon);
      expect(world.phase).toBe('over');
      // Through JSON, as it travels to the server.
      const copy = JSON.parse(JSON.stringify(replay)) as Replay;
      expect(summary(replayRun(copy, zone))).toEqual(summary(world));
    },
    30_000,
  );

  it('stays small', () => {
    const { replay } = recordBot(11, 'staff');
    expect(JSON.stringify(replay).length).toBeLessThan(150_000);
  }, 30_000);

  it('splits long runs of the same input', () => {
    const recorder = new ReplayRecorder(5, 'scimitar');
    const world = createWorld({ seed: 5, zone, weapons: ['scimitar'] });
    // Hold right for 1000 ticks, then stand still until wave 1 ends one way or another.
    while (world.phase === 'wave') {
      step(world, [recorder.input({ moveX: world.tick < 1000 ? 1 : 0, moveY: 0 })]);
    }
    const replay = recorder.finish();
    // One 3-byte record (4 base64 chars) per 256 ticks of the same input.
    const records = Math.ceil(1000 / 256) + Math.ceil((world.tick - 1000) / 256);
    expect(replay.moves.length).toBe(records * 4);
    if (world.phase === 'over') {
      expect(summary(replayRun(replay, zone))).toEqual(summary(world));
    } else {
      // The recording ends in the shop, so the replay stalls there.
      expect(() => replayRun(replay, zone)).toThrow(/stalled between waves/);
    }
  });

  describe('rejects tampering', () => {
    const { replay } = recordBot(22, 'shortbow');
    const cases: [string, Replay, RegExp][] = [
      ['an unknown format', { ...replay, format: 99 }, /format/],
      ['a bad weapon', { ...replay, weapon: 'excalibur' as WeaponId }, /weapon/],
      ['a bad seed', { ...replay, seed: -1 }, /seed/],
      ['moves cut short', { ...replay, moves: replay.moves.slice(0, 400) }, /ran out of moves/],
      ['extra moves', { ...replay, moves: replay.moves + 'AAAA' }, /moves left/],
      [
        'an extra action',
        { ...replay, actions: [...replay.actions, { tick: 1e9, action: { type: 'ready' } }] },
        /actions left/,
      ],
      [
        'a refused action',
        { ...replay, actions: [{ tick: 0, action: { type: 'reroll' } }, ...replay.actions] },
        /refused/,
      ],
      [
        'a malformed action',
        { ...replay, actions: [{ tick: 0, action: { type: 'win' } } as never] },
        /bad action/,
      ],
      ['bad base64', { ...replay, moves: '!!!!' }, /bad moves/],
    ];
    it.each(cases)('%s', (_, tampered, message) => {
      expect(() => replayRun(tampered, zone)).toThrow(ReplayError);
      expect(() => replayRun(tampered, zone)).toThrow(message);
    });
  });
});

describe('quantizeInput', () => {
  it('rounds to 1/127 steps, clamps, and never returns -0', () => {
    expect(quantizeInput({ moveX: 1, moveY: -1 })).toEqual({ moveX: 1, moveY: -1 });
    expect(quantizeInput({ moveX: 0.5, moveY: 2 })).toEqual({ moveX: 64 / 127, moveY: 1 });
    const tiny = quantizeInput({ moveX: -0.001, moveY: Number.NaN });
    expect(Object.is(tiny.moveX, 0)).toBe(true);
    expect(tiny.moveY).toBe(0);
  });

  it('is what the recorder hands back', () => {
    const recorder = new ReplayRecorder(1, 'dagger');
    const command = { moveX: 0.3127, moveY: -0.8 };
    expect(recorder.input(command)).toEqual(quantizeInput(command));
    expect(quantizeInput(quantizeInput(command))).toEqual(quantizeInput(command));
  });
});
