import { MAX_WEAPONS, ZONES, type WaveDef, type ZoneDef } from '@game/content';
import { describe, expect, it } from 'vitest';
import { applyAction, createWorld, NEUTRAL_INPUT, step, TICK_RATE, type World } from '../src';
import { damageEnemy, gainXp, spawnEnemy } from '../src/combat';
import { armourFactor, xpToNext } from '../src/stats';

const quietWave = (duration: number): WaveDef => ({ duration, hpScale: 1, damageScale: 1, spawns: [] });
const quietZone = (...durations: number[]): ZoneDef => ({
  ...ZONES.wolfmoor,
  waves: durations.map(quietWave),
});

function idle(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(world, [NEUTRAL_INPUT]);
}

function playerOf(world: World) {
  const p = world.players[0];
  if (!p) throw new Error('no player');
  return p;
}

/** Kills an enemy outright, as if Bob hit it. */
function kill(world: World, id: number): void {
  const e = world.enemies.find((x) => x.id === id);
  if (!e) throw new Error(`no enemy ${id}`);
  damageEnemy(world, e, e.hp, false, 0, 0, playerOf(world));
}

describe('wave flow', () => {
  it('opens the shop when a wave times out with no level-ups', () => {
    const world = createWorld({ seed: 1, zone: quietZone(2, 2) });
    idle(world, 2 * TICK_RATE);
    expect(world.phase).toBe('intermission');
    expect(playerOf(world).intermission).toBe('shop');
    expect(playerOf(world).shop).toHaveLength(4);
    expect(world.events.some((e) => e.type === 'waveEnd')).toBe(true);
  });

  it('asks for one upgrade pick per level gained, then opens the shop', () => {
    const world = createWorld({ seed: 2, zone: quietZone(1, 1) });
    const p = playerOf(world);
    gainXp(world, p, xpToNext(1) + xpToNext(2));
    expect(p.level).toBe(3);
    idle(world, TICK_RATE);

    expect(p.intermission).toBe('levelUp');
    expect(p.upgrades).toHaveLength(4);
    expect(new Set(p.upgrades.map((u) => u.skill)).size).toBe(4);

    const first = p.upgrades[0]!;
    expect(applyAction(world, 0, { type: 'chooseUpgrade', index: 0 })).toBe(true);
    expect(p.skills[first.skill]).toBe(first.points);
    expect(p.intermission).toBe('levelUp');
    applyAction(world, 0, { type: 'chooseUpgrade', index: 1 });
    expect(p.intermission).toBe('shop');
  });

  it('starts the next wave at full HP when the player is ready', () => {
    const world = createWorld({ seed: 3, zone: quietZone(1, 5) });
    const p = playerOf(world);
    p.hp = 3;
    idle(world, TICK_RATE);
    expect(applyAction(world, 0, { type: 'ready' })).toBe(true);
    expect(world.phase).toBe('wave');
    expect(world.wave).toBe(2);
    expect(p.hp).toBe(p.maxHp);
    expect(p.x).toBe(world.arena.width / 2);
  });

  it('ends in victory after the last wave', () => {
    const world = createWorld({ seed: 4, zone: quietZone(1) });
    idle(world, TICK_RATE);
    expect(world.phase).toBe('over');
    expect(world.outcome).toBe('victory');
  });

  it('banks coins left on the ground and pays them out next wave', () => {
    const world = createWorld({ seed: 5, zone: quietZone(1, 5) });
    const p = playerOf(world);
    const zombie = spawnEnemy(world, 'zombie', p.x + 400, p.y, false);
    kill(world, zombie.id);
    const dropped = world.pickups.reduce((sum, pk) => sum + (pk.kind === 'coin' ? pk.value : 0), 0);
    expect(dropped).toBeGreaterThan(0);
    idle(world, TICK_RATE);
    expect(p.bank).toBe(dropped);
  });
});

describe('combat', () => {
  it('splits a bog slime into two, then four', () => {
    const world = createWorld({ seed: 6, zone: quietZone(60) });
    const slime = spawnEnemy(world, 'slime', 500, 500, false);
    kill(world, slime.id);
    const medium = world.enemies.filter((e) => e.alive && e.def.id === 'slimeMedium');
    expect(medium).toHaveLength(2);
    for (const m of medium) kill(world, m.id);
    expect(world.enemies.filter((e) => e.alive && e.def.id === 'slimeSmall')).toHaveLength(4);
    expect(world.goo.length).toBe(3);
  });

  it('turns a werewolf into a wolf below half HP, then telegraphs and lunges', () => {
    const world = createWorld({ seed: 7, zone: quietZone(60), weapons: ['dagger'] });
    const p = playerOf(world);
    const wolf = spawnEnemy(world, 'werewolf', p.x + 150, p.y, false);
    damageEnemy(world, wolf, Math.ceil(wolf.maxHp * 0.6), false, 0, 0, p);
    p.weapons.length = 0;

    const seen = new Set<string>();
    for (let i = 0; i < 3 * TICK_RATE; i++) {
      step(world, [NEUTRAL_INPUT]);
      for (const event of world.events) seen.add(event.type);
    }
    expect(wolf.transformed).toBe(true);
    expect(seen).toContain('transform');
    expect(seen).toContain('telegraph');
    expect(seen).toContain('lunge');
  });

  it('reduces damage with armour', () => {
    expect(armourFactor(0)).toBe(1);
    expect(armourFactor(15)).toBe(0.5);
    expect(armourFactor(-15)).toBe(2);
  });

  it('kills enemies with the starting weapon and drops coins', () => {
    const world = createWorld({ seed: 8, zone: quietZone(60) });
    const p = playerOf(world);
    spawnEnemy(world, 'zombie', p.x + 40, p.y, false);
    idle(world, 2 * TICK_RATE);
    expect(world.stats.kills).toBe(1);
    expect(p.coins).toBeGreaterThan(0);
  });
});

describe('shop', () => {
  function shopWorld(seed = 9): World {
    const world = createWorld({ seed, zone: quietZone(1, 1) });
    idle(world, TICK_RATE);
    playerOf(world).coins = 1000;
    return world;
  }

  it('sells an offer once and charges for it', () => {
    const world = shopWorld();
    const p = playerOf(world);
    const offer = p.shop[0]!;
    expect(applyAction(world, 0, { type: 'buy', index: 0 })).toBe(true);
    expect(p.coins).toBe(1000 - offer.price);
    expect(offer.sold).toBe(true);
    expect(applyAction(world, 0, { type: 'buy', index: 0 })).toBe(false);
  });

  it('keeps locked offers through a reroll', () => {
    const world = shopWorld();
    const p = playerOf(world);
    const locked = p.shop[1]!;
    applyAction(world, 0, { type: 'toggleLock', index: 1 });
    expect(applyAction(world, 0, { type: 'reroll' })).toBe(true);
    expect(p.shop[1]).toBe(locked);
    expect(p.rerolls).toBe(1);
  });

  it('refuses weapons once every slot is full, and always keeps one weapon', () => {
    const world = shopWorld();
    const p = playerOf(world);
    while (p.weapons.length < MAX_WEAPONS) p.weapons.push({ id: 'dagger', cooldown: 0 });
    p.shop[0] = { kind: 'weapon', id: 'shortbow', rarity: 1, price: 10, locked: false, sold: false };
    expect(applyAction(world, 0, { type: 'buy', index: 0 })).toBe(false);

    while (p.weapons.length > 1) applyAction(world, 0, { type: 'sellWeapon', index: 0 });
    expect(applyAction(world, 0, { type: 'sellWeapon', index: 0 })).toBe(false);
    expect(p.weapons).toHaveLength(1);
  });

  it('applies item stats when bought', () => {
    const world = shopWorld();
    const p = playerOf(world);
    const before = p.maxHp;
    p.shop[0] = { kind: 'item', id: 'thickCloak', rarity: 1, price: 10, locked: false, sold: false };
    applyAction(world, 0, { type: 'buy', index: 0 });
    expect(p.skillTotals.hitpoints).toBe(3);
    expect(p.maxHp).toBe(before + 9);
  });
});
