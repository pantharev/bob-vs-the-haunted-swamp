import { BOB, ZONES } from '@game/content';
import { describe, expect, it } from 'vitest';
import { createWorld, step, TICK_RATE, type InputCommand, type World } from '../src';

const zone = ZONES.wolfmoor;

function run(world: World, input: InputCommand, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(world, [input]);
}

function playerOf(world: World) {
  const player = world.players[0];
  if (!player) throw new Error('world has no player');
  return player;
}

describe('step', () => {
  it('spawns the player at the arena centre', () => {
    const p = playerOf(createWorld({ seed: 1, zone }));
    expect(p.x).toBe(zone.width / 2);
    expect(p.y).toBe(zone.height / 2);
  });

  it('moves right, faces right, and reaches top speed', () => {
    const world = createWorld({ seed: 1, zone });
    run(world, { moveX: -1, moveY: 0 }, 5);
    expect(playerOf(world).facing).toBe(-1);

    const startX = playerOf(world).x;
    run(world, { moveX: 1, moveY: 0 }, TICK_RATE);
    const p = playerOf(world);
    expect(p.x).toBeGreaterThan(startX);
    expect(p.facing).toBe(1);
    expect(p.vx).toBeCloseTo(BOB.moveSpeed, 1);
  });

  it('does not move faster diagonally', () => {
    const world = createWorld({ seed: 1, zone });
    run(world, { moveX: 1, moveY: 1 }, TICK_RATE);
    const p = playerOf(world);
    expect(Math.sqrt(p.vx * p.vx + p.vy * p.vy)).toBeCloseTo(BOB.moveSpeed, 1);
  });

  it('keeps facing when input is only vertical', () => {
    const world = createWorld({ seed: 1, zone });
    run(world, { moveX: -1, moveY: 0 }, 3);
    run(world, { moveX: 0, moveY: 1 }, 30);
    expect(playerOf(world).facing).toBe(-1);
  });

  it('stops when input is released', () => {
    const world = createWorld({ seed: 1, zone });
    run(world, { moveX: 1, moveY: 0 }, 30);
    run(world, { moveX: 0, moveY: 0 }, 60);
    expect(Math.abs(playerOf(world).vx)).toBeLessThan(0.01);
  });

  it('is clamped inside the arena', () => {
    const world = createWorld({ seed: 1, zone });
    run(world, { moveX: -1, moveY: -1 }, TICK_RATE * 20);
    const p = playerOf(world);
    expect(p.x).toBe(p.radius);
    expect(p.y).toBe(p.radius);
  });

  it('records the previous position for interpolation', () => {
    const world = createWorld({ seed: 1, zone });
    run(world, { moveX: 1, moveY: 0 }, 10);
    const before = playerOf(world).x;
    step(world, [{ moveX: 1, moveY: 0 }]);
    expect(playerOf(world).prevX).toBe(before);
  });

  it('replays identically from the same seed and inputs', () => {
    const inputs: InputCommand[] = Array.from({ length: 600 }, (_, i) => ({
      moveX: Math.cos(i / 37),
      moveY: Math.sin(i / 23),
    }));
    const a = createWorld({ seed: 77, zone });
    const b = createWorld({ seed: 77, zone });
    for (const input of inputs) {
      step(a, [input]);
      step(b, [input]);
    }
    expect(a.players).toEqual(b.players);
    expect(a.rng.getState()).toEqual(b.rng.getState());
  });
});
