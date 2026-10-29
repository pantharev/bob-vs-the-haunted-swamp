import { BOB, type CharacterDef, type WeaponId, type ZoneDef } from '@game/content';
import { seconds } from './constants';
import type { RunOutcome } from './events';
import { gainXp } from './combat';
import { scoreVictory, scoreWave } from './score';
import { openShop } from './shop';
import { recomputeStats } from './stats';
import { rollUpgrades } from './upgrades';
import { createPlayer, createWorldState, type World } from './world';

/** Spawn protection at the start of each wave. */
const WAVE_START_IFRAMES = seconds(1);
/** Weapons start their first cooldown staggered by slot so they don't all fire at once. */
const WEAPON_STAGGER = 7;

export interface WorldOptions {
  seed: number;
  zone: ZoneDef;
  playerCount?: number;
  character?: CharacterDef;
  /** Starting weapons. Default: one scimitar. */
  weapons?: readonly WeaponId[];
  /** Co-op: each player's own starting weapons. Overrides `playerCount` and `weapons`. */
  loadouts?: readonly (readonly WeaponId[])[];
  /** Debug: begin at this wave (1-based). */
  startWave?: number;
}

export function createWorld({
  seed,
  zone,
  playerCount = 1,
  character = BOB,
  weapons = ['scimitar'],
  loadouts = Array.from({ length: playerCount }, () => weapons),
  startWave: firstWave = 1,
}: WorldOptions): World {
  const players = loadouts.map((kit, id) => {
    const p = createPlayer(id, character, kit);
    recomputeStats(p);
    return p;
  });
  const world = createWorldState(seed, zone, players);
  startWave(world, Math.max(1, Math.min(firstWave, zone.waves.length)));
  return world;
}

export function startWave(world: World, wave: number): void {
  const def = world.waves[wave - 1];
  world.phase = 'wave';
  world.wave = wave;
  world.waveTick = 0;
  world.waveTicks = def ? seconds(def.duration) : 0;
  world.ruleNext = def ? def.spawns.map((rule) => seconds(rule.from ?? 0)) : [];

  const { arena, players } = world;
  players.forEach((p, i) => {
    // Co-op players start in a small row around the centre.
    p.x = p.prevX = arena.width / 2 + (i - (players.length - 1) / 2) * p.radius * 4;
    p.y = p.prevY = arena.height / 2;
    p.vx = p.vy = 0;
    if (!p.alive) return;
    p.hp = p.maxHp;
    p.invulnerable = WAVE_START_IFRAMES;
    p.regenCarry = 0;
    p.intermission = 'ready';
    p.weapons.forEach((w, slot) => (w.cooldown = slot * WEAPON_STAGGER));
  });
  world.events.push({ type: 'waveStart', wave });
}

/** Wave timer ran out: clear the arena, bank loose coins, then intermission or victory. */
export function endWave(world: World): void {
  world.events.push({ type: 'waveEnd', wave: world.wave });
  // Before anything heals: the bonus rewards the HP the wave left you with.
  scoreWave(world);

  for (const e of world.enemies) {
    world.events.push({
      type: 'enemyDeath',
      id: e.id,
      enemy: e.def.id,
      elite: e.elite,
      x: e.x,
      y: e.y,
      cleared: true,
    });
  }
  let loose = 0;
  for (const pk of world.pickups) if (pk.kind === 'coin') loose += pk.value;
  clearArena(world);

  const alive = world.players.filter((p) => p.alive);
  alive.forEach((p, i) => {
    // Split loose coins between survivors; the first ones get the remainder.
    p.bank += Math.floor(loose / alive.length) + (i < loose % alive.length ? 1 : 0);
    const harvest = Math.round(p.stats.harvest);
    if (harvest > 0) {
      p.coins += harvest;
      world.stats.coinsCollected += harvest;
      gainXp(world, p, harvest);
    }
  });

  if (world.wave >= world.waves.length) {
    scoreVictory(world);
    endRun(world, 'victory');
    return;
  }
  world.phase = 'intermission';
  for (const p of alive) {
    if (p.pendingLevels > 0) {
      p.intermission = 'levelUp';
      rollUpgrades(world, p);
    } else {
      p.intermission = 'shop';
      openShop(world, p);
    }
  }
}

export function endRun(world: World, outcome: RunOutcome): void {
  world.phase = 'over';
  world.outcome = outcome;
  world.events.push({ type: 'runOver', outcome });
}

function clearArena(world: World): void {
  const { pools } = world;
  for (const e of world.enemies) pools.enemies.push(e);
  for (const pr of world.projectiles) pools.projectiles.push(pr);
  for (const pk of world.pickups) pools.pickups.push(pk);
  world.enemies.length = 0;
  world.projectiles.length = 0;
  world.pickups.length = 0;
  world.markers.length = 0;
  world.goo.length = 0;
}
