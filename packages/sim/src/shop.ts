import {
  ITEMS,
  ITEMS_BY_ID,
  MAX_WEAPONS,
  WEAPON_IDS,
  WEAPONS,
  type Rarity,
  type WeaponId,
} from '@game/content';
import { recomputeStats } from './stats';
import { rollTier } from './upgrades';
import type { Player, ShopOffer, World } from './world';

export const SHOP_SLOTS = 4;
const WEAPON_OFFER_CHANCE = 0.35;
/** Prices rise this much per wave survived. */
const INFLATION = 0.1;

export function inflate(price: number, wave: number): number {
  return Math.round(price * (1 + INFLATION * Math.max(0, wave - 1)));
}

export function rerollPrice(world: World, p: Player): number {
  return world.wave + 1 + p.rerolls * 2;
}

export function sellPrice(world: World, weapon: WeaponId): number {
  return Math.floor(inflate(WEAPONS[weapon].price, world.wave) / 2);
}

export function openShop(world: World, p: Player): void {
  p.rerolls = 0;
  restock(world, p);
}

/** Refills every slot except locked, unsold offers. */
export function restock(world: World, p: Player): void {
  const offers: ShopOffer[] = [];
  for (let i = 0; i < SHOP_SLOTS; i++) {
    const old = p.shop[i];
    offers.push(old && old.locked && !old.sold ? old : rollOffer(world, p, offers));
  }
  p.shop = offers;
}

function rollOffer(world: World, p: Player, taken: readonly ShopOffer[]): ShopOffer {
  const { rng } = world;
  if (rng.chance(WEAPON_OFFER_CHANCE)) {
    const id = rng.pick(WEAPON_IDS);
    return offer('weapon', id, 1, inflate(WEAPONS[id].price, world.wave));
  }

  const rarity = itemRarity(world, p);
  const available = (r: Rarity) =>
    ITEMS.filter(
      (item) =>
        item.rarity === r &&
        (item.max === undefined || (p.items[item.id] ?? 0) < item.max) &&
        !taken.some((o) => o.id === item.id),
    );
  let candidates = available(rarity);
  if (candidates.length === 0) candidates = available(1);
  if (candidates.length === 0) {
    const id = rng.pick(WEAPON_IDS);
    return offer('weapon', id, 1, inflate(WEAPONS[id].price, world.wave));
  }
  const item = rng.pick(candidates);
  return offer('item', item.id, item.rarity, inflate(item.price, world.wave));
}

function itemRarity(world: World, p: Player): Rarity {
  const wave = world.wave;
  const luckMul = 1 + Math.max(0, p.stats.luck) / 100;
  const p4 = wave >= 7 ? (0.02 + 0.01 * (wave - 7)) * luckMul : 0;
  const p3 = wave >= 4 ? (0.06 + 0.02 * (wave - 4)) * luckMul : 0;
  const p2 = wave >= 2 ? (0.2 + 0.04 * (wave - 2)) * luckMul : 0;
  return rollTier(world.rng, p2, p3, p4);
}

function offer(kind: ShopOffer['kind'], id: string, rarity: Rarity, price: number): ShopOffer {
  return { kind, id, rarity, price, locked: false, sold: false };
}

/** Why an offer can't be bought right now, or null if it can. */
export function buyBlocker(p: Player, o: ShopOffer): 'sold' | 'coins' | 'slots' | null {
  if (o.sold) return 'sold';
  if (p.coins < o.price) return 'coins';
  if (o.kind === 'weapon' && p.weapons.length >= MAX_WEAPONS) return 'slots';
  return null;
}

export function buy(p: Player, o: ShopOffer): boolean {
  if (buyBlocker(p, o)) return false;
  p.coins -= o.price;
  o.sold = true;
  o.locked = false;
  if (o.kind === 'weapon') {
    p.weapons.push({ id: o.id as WeaponId, cooldown: 0 });
  } else if (ITEMS_BY_ID.has(o.id)) {
    p.items[o.id] = (p.items[o.id] ?? 0) + 1;
    recomputeStats(p);
  }
  return true;
}
