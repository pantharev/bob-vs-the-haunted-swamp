import { BOB, type CharacterDef, type ZoneDef } from '@game/content';
import { Rng } from './rng';

export interface Player {
  readonly id: number;
  x: number;
  y: number;
  /** Position at the start of the latest tick, for render interpolation. */
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  readonly radius: number;
  moveSpeed: number;
}

export interface Arena {
  readonly width: number;
  readonly height: number;
}

export interface World {
  readonly seed: number;
  tick: number;
  readonly rng: Rng;
  readonly arena: Arena;
  readonly players: Player[];
}

export interface WorldOptions {
  seed: number;
  zone: ZoneDef;
  playerCount?: number;
  character?: CharacterDef;
}

export function createWorld({ seed, zone, playerCount = 1, character = BOB }: WorldOptions): World {
  const arena: Arena = { width: zone.width, height: zone.height };
  const players: Player[] = [];
  for (let id = 0; id < playerCount; id++) {
    // Co-op players start in a small row around the centre.
    const x = arena.width / 2 + (id - (playerCount - 1) / 2) * character.radius * 4;
    const y = arena.height / 2;
    players.push({
      id,
      x,
      y,
      prevX: x,
      prevY: y,
      vx: 0,
      vy: 0,
      facing: 1,
      radius: character.radius,
      moveSpeed: character.moveSpeed,
    });
  }
  return { seed, tick: 0, rng: new Rng(seed), arena, players };
}
