import {
  ITEMS,
  ITEMS_BY_ID,
  MAX_TIER,
  MAX_WEAPONS,
  SHOP_MAX_TIER,
  shopTier,
  TIER_ROLL,
  TIERS,
  WEAPON_IDS,
  WEAPONS,
  type Rarity,
  type Tier,
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

export function weaponPrice(id: WeaponId, tier: Tier, wave: number): number {
  return inflate(WEAPONS[id].price * TIERS[tier].price, wave);
}

export function sellPrice(world: World, weapon: WeaponId, tier: Tier): number {
  return Math.floor(weaponPrice(weapon, tier, world.wave) / 2);
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
  if (rng.chance(WEAPON_OFFER_CHANCE)) return weaponOffer(world, p);

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
  if (candidates.length === 0) return weaponOffer(world, p);
  const item = rng.pick(candidates);
  return offer('item', item.id, item.rarity, 1, inflate(item.price, world.wave));
}

function weaponOffer(world: World, p: Player): ShopOffer {
  const id = world.rng.pick(WEAPON_IDS);
  const tier = offerTier(world, p);
  return offer('weapon', id, 1, tier, weaponPrice(id, tier, world.wave));
}

/** Around the wave's tier: sometimes one lower (merge fodder), sometimes higher (luck helps). */
function offerTier(world: World, p: Player): Tier {
  const luckMul = 1 + Math.max(0, p.stats.luck) / 100;
  const upTwo = TIER_ROLL.upTwo * luckMul;
  const up = upTwo + TIER_ROLL.up * luckMul;
  const roll = world.rng.next();
  const step = roll < upTwo ? 2 : roll < up ? 1 : roll < up + TIER_ROLL.down ? -1 : 0;
  return Math.max(1, Math.min(SHOP_MAX_TIER, shopTier(world.wave) + step)) as Tier;
}

function itemRarity(world: World, p: Player): Rarity {
  const wave = world.wave;
  const luckMul = 1 + Math.max(0, p.stats.luck) / 100;
  const p4 = wave >= 7 ? (0.02 + 0.01 * (wave - 7)) * luckMul : 0;
  const p3 = wave >= 4 ? (0.06 + 0.02 * (wave - 4)) * luckMul : 0;
  const p2 = wave >= 2 ? (0.2 + 0.04 * (wave - 2)) * luckMul : 0;
  return rollTier(world.rng, p2, p3, p4);
}

function offer(
  kind: ShopOffer['kind'],
  id: string,
  rarity: Rarity,
  tier: Tier,
  price: number,
): ShopOffer {
  return { kind, id, rarity, tier, price, locked: false, sold: false };
}

/** The owned weapon a weapon of this kind would merge with (same weapon, same tier), or -1. */
export function mergePartner(p: Player, id: string, tier: Tier, except = -1): number {
  if (tier >= MAX_TIER) return -1;
  return p.weapons.findIndex((w, i) => i !== except && w.id === id && w.tier === tier);
}

/** Why an offer can't be bought right now, or null if it can. A weapon fits full slots if it merges. */
export function buyBlocker(p: Player, o: ShopOffer): 'sold' | 'coins' | 'slots' | null {
  if (o.sold) return 'sold';
  if (p.coins < o.price) return 'coins';
  if (o.kind === 'weapon' && p.weapons.length >= MAX_WEAPONS && mergePartner(p, o.id, o.tier) < 0)
    return 'slots';
  return null;
}

export function buy(p: Player, o: ShopOffer): boolean {
  if (buyBlocker(p, o)) return false;
  p.coins -= o.price;
  o.sold = true;
  o.locked = false;
  if (o.kind === 'weapon') {
    // With every slot taken, the new copy merges straight into its twin.
    const twin = p.weapons.length >= MAX_WEAPONS ? mergePartner(p, o.id, o.tier) : -1;
    if (twin >= 0) p.weapons[twin]!.tier = (o.tier + 1) as Tier;
    else p.weapons.push({ id: o.id as WeaponId, tier: o.tier, cooldown: 0 });
  } else if (ITEMS_BY_ID.has(o.id)) {
    p.items[o.id] = (p.items[o.id] ?? 0) + 1;
    recomputeStats(p);
  }
  return true;
}

/** Merges the weapon at `index` with its twin into one of the next tier, in the earlier slot. */
export function mergeWeapons(p: Player, index: number): boolean {
  const w = p.weapons[index];
  if (!w) return false;
  const twin = mergePartner(p, w.id, w.tier, index);
  if (twin < 0) return false;
  const [keep, drop] = index < twin ? [index, twin] : [twin, index];
  p.weapons[keep]!.tier = (w.tier + 1) as Tier;
  p.weapons.splice(drop, 1);
  return true;
}
