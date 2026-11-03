import {
  MAX_TIER,
  MAX_WEAPONS,
  shopTier,
  TIERS,
  WEAPONS,
  ZONES,
  type WaveDef,
  type ZoneDef,
} from '@game/content';
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createWorld,
  NEUTRAL_INPUT,
  sellPrice,
  step,
  TICK_RATE,
  weaponPrice,
  type World,
} from '../src';
import { damageEnemy, gainXp, spawnEnemy } from '../src/combat';
import { restock } from '../src/shop';
import { updateWeapons } from '../src/weapons';
import { armourFactor, xpToNext } from '../src/stats';

const quietWave = (duration: number): WaveDef => ({
  duration,
  hpScale: 1,
  damageScale: 1,
  spawns: [],
});
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
    while (p.weapons.length < MAX_WEAPONS) p.weapons.push({ id: 'dagger', tier: 1, cooldown: 0 });
    p.shop[0] = weaponOffer('shortbow', 1);
    expect(applyAction(world, 0, { type: 'buy', index: 0 })).toBe(false);

    while (p.weapons.length > 1) applyAction(world, 0, { type: 'sellWeapon', index: 0 });
    expect(applyAction(world, 0, { type: 'sellWeapon', index: 0 })).toBe(false);
    expect(p.weapons).toHaveLength(1);
  });

  it('merges a bought weapon into its twin when every slot is full', () => {
    const world = shopWorld();
    const p = playerOf(world);
    while (p.weapons.length < MAX_WEAPONS) p.weapons.push({ id: 'dagger', tier: 1, cooldown: 0 });
    p.shop[0] = weaponOffer('dagger', 1);
    p.shop[1] = weaponOffer('dagger', 2);
    expect(applyAction(world, 0, { type: 'buy', index: 0 })).toBe(true);
    expect(p.weapons).toHaveLength(MAX_WEAPONS);
    expect(p.weapons.map((w) => w.tier)).toEqual([1, 2, 1, 1, 1, 1]);
    // An Iron dagger now has a twin to merge with, too.
    expect(applyAction(world, 0, { type: 'buy', index: 1 })).toBe(true);
    expect(p.weapons.map((w) => w.tier)).toEqual([1, 3, 1, 1, 1, 1]);
  });

  it('applies item stats when bought', () => {
    const world = shopWorld();
    const p = playerOf(world);
    const before = p.maxHp;
    p.shop[0] = {
      kind: 'item',
      id: 'thickCloak',
      rarity: 1,
      tier: 1,
      price: 10,
      locked: false,
      sold: false,
    };
    applyAction(world, 0, { type: 'buy', index: 0 });
    expect(p.skillTotals.hitpoints).toBe(3);
    expect(p.maxHp).toBe(before + 9);
  });
});

describe('metal tiers', () => {
  function shopWorld(seed = 9): World {
    const world = createWorld({ seed, zone: quietZone(1, 1) });
    idle(world, TICK_RATE);
    playerOf(world).coins = 1000;
    return world;
  }

  it('merges two of a weapon at one tier into the next, in the earlier slot', () => {
    const world = shopWorld();
    const p = playerOf(world);
    p.weapons.push(
      { id: 'dagger', tier: 2, cooldown: 0 },
      { id: 'shortbow', tier: 2, cooldown: 0 },
      { id: 'dagger', tier: 2, cooldown: 0 },
      { id: 'dagger', tier: 1, cooldown: 0 },
    );
    expect(applyAction(world, 0, { type: 'merge', index: 3 })).toBe(true);
    expect(p.weapons.map((w) => `${w.id}${w.tier}`)).toEqual([
      'scimitar1',
      'dagger3',
      'shortbow2',
      'dagger1',
    ]);
    // No twin: the shortbow, the last dagger, the scimitar.
    for (const index of [0, 2, 3])
      expect(applyAction(world, 0, { type: 'merge', index })).toBe(false);
  });

  it('stops merging at the top tier', () => {
    const world = shopWorld();
    const p = playerOf(world);
    p.weapons.push({ id: 'dagger', tier: MAX_TIER, cooldown: 0 });
    p.weapons.push({ id: 'dagger', tier: MAX_TIER, cooldown: 0 });
    expect(applyAction(world, 0, { type: 'merge', index: 1 })).toBe(false);
  });

  it('prices and sells by tier', () => {
    const world = shopWorld();
    expect(weaponPrice('dagger', 1, 1)).toBe(WEAPONS.dagger.price);
    expect(weaponPrice('dagger', 4, 1)).toBe(Math.round(WEAPONS.dagger.price * TIERS[4].price));
    expect(sellPrice(world, 'dagger', 4)).toBe(Math.floor(weaponPrice('dagger', 4, 1) / 2));
  });

  it("stocks weapons around the wave's tier, never above Runic", () => {
    const world = shopWorld();
    const p = playerOf(world);
    const seen = new Map<number, number>();
    for (const wave of [1, 5, 9]) {
      world.wave = wave;
      seen.clear();
      for (let i = 0; i < 400; i++) {
        restock(world, p);
        for (const o of p.shop)
          if (o.kind === 'weapon') seen.set(o.tier, (seen.get(o.tier) ?? 0) + 1);
      }
      const base = shopTier(wave);
      const tiers = [...seen.keys()];
      expect(Math.min(...tiers)).toBeGreaterThanOrEqual(Math.max(1, base - 1));
      expect(Math.max(...tiers)).toBeLessThanOrEqual(Math.min(6, base + 2));
      // Most offers sit on the wave's own tier.
      const total = [...seen.values()].reduce((a, b) => a + b, 0);
      expect(seen.get(base)! / total).toBeGreaterThan(0.55);
    }
  });

  it('hits harder and faster as the tier rises', () => {
    const hit = (tier: 1 | 4) => {
      const world = createWorld({ seed: 3, zone: quietZone(60) });
      const p = playerOf(world);
      p.weapons[0]!.tier = tier;
      const e = spawnEnemy(world, 'zombie', p.x + 30, p.y, false);
      e.hp = e.maxHp = 1e6;
      world.grid.rebuild(world.enemies);
      world.events.length = 0;
      updateWeapons(world);
      const ev = world.events.find((x) => x.type === 'enemyHit');
      if (ev?.type !== 'enemyHit') throw new Error('no hit');
      return {
        damage: ev.amount / (ev.crit ? WEAPONS.scimitar.critMultiplier : 1),
        cooldown: p.weapons[0]!.cooldown,
      };
    };
    const bronze = hit(1);
    const mithril = hit(4);
    expect(bronze.damage).toBeCloseTo(WEAPONS.scimitar.damage, 0);
    expect(mithril.damage).toBeCloseTo(WEAPONS.scimitar.damage * TIERS[4].damage, 0);
    expect(mithril.cooldown).toBe(Math.round(bronze.cooldown / TIERS[4].attackSpeed));
  });
});

function weaponOffer(id: 'dagger' | 'shortbow', tier: 1 | 2) {
  return { kind: 'weapon', id, rarity: 1, tier, price: 10, locked: false, sold: false } as const;
}
