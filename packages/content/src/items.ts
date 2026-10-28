import type { Rarity, SkillId, StatKey } from './skills';

/**
 * Passive shop items. `mods` add skill points (which flow through the skill
 * effects) or raw stats, per copy owned. Names are inspired-by, never the
 * originals (PLAN.md §12).
 */

export type ItemMods = Partial<Record<SkillId | StatKey, number>>;

export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly rarity: Rarity;
  readonly price: number;
  readonly mods: ItemMods;
  /** Copies a player may own (default: unlimited). */
  readonly max?: number;
}

export const ITEMS: readonly ItemDef[] = [
  {
    id: 'saltCharm',
    name: 'Blessed salt charm',
    blurb: 'The dead hate salt.',
    rarity: 2,
    price: 22,
    mods: { undeadDamage: 25 },
  },
  {
    id: 'silverDust',
    name: 'Pouch of silver dust',
    blurb: 'A pinch on every blade.',
    rarity: 2,
    price: 20,
    mods: { beastDamage: 40 },
  },
  {
    id: 'fortuneRing',
    name: 'Ring of fortune',
    blurb: 'Better shop rolls and more coins.',
    rarity: 2,
    price: 25,
    mods: { thieving: 3 },
  },
  {
    id: 'trollBracer',
    name: 'Troll-hide bracer',
    blurb: 'Wounds close on their own.',
    rarity: 1,
    price: 13,
    mods: { prayer: 2 },
  },
  {
    id: 'lantern',
    name: 'Bright lantern',
    blurb: 'Pulls coins in from further away and lights the fog.',
    rarity: 1,
    price: 10,
    mods: { pickupRange: 30 },
    max: 3,
  },
  {
    id: 'weightedBoots',
    name: 'Weighted boots',
    blurb: 'Sturdy, if a little slow.',
    rarity: 1,
    price: 12,
    mods: { defence: 3, agility: -1 },
  },
  {
    id: 'spikedGauntlets',
    name: 'Spiked gauntlets',
    blurb: 'Hit harder, swing sooner.',
    rarity: 2,
    price: 24,
    mods: { strength: 3, attack: 1 },
  },
  {
    id: 'featherCap',
    name: 'Feathered cap',
    blurb: 'Light on your feet.',
    rarity: 1,
    price: 13,
    mods: { agility: 2 },
  },
  {
    id: 'quiver',
    name: "Fletcher's quiver",
    blurb: 'Straighter arrows.',
    rarity: 1,
    price: 13,
    mods: { ranged: 2 },
  },
  {
    id: 'tome',
    name: 'Cracked spell tome',
    blurb: 'Most of the pages are still legible.',
    rarity: 1,
    price: 13,
    mods: { magic: 2 },
  },
  {
    id: 'thickCloak',
    name: 'Thick wool cloak',
    blurb: 'Keeps the damp and the claws out.',
    rarity: 1,
    price: 12,
    mods: { hitpoints: 3 },
  },
  {
    id: 'seedPouch',
    name: 'Seed pouch',
    blurb: 'Something always grows back.',
    rarity: 1,
    price: 10,
    mods: { farming: 2 },
  },
  {
    id: 'huntersHood',
    name: "Hunter's hood",
    blurb: 'For the big ones.',
    rarity: 2,
    price: 22,
    mods: { slayer: 3, defence: 1 },
  },
  {
    id: 'vampFang',
    name: 'Vampiric fang',
    blurb: 'Hits sometimes heal you.',
    rarity: 3,
    price: 38,
    mods: { lifesteal: 4 },
  },
  {
    id: 'rabbitFoot',
    name: "Lucky rabbit's foot",
    blurb: 'Crits, and a little luck.',
    rarity: 3,
    price: 36,
    mods: { critChance: 8, thieving: 1 },
  },
  {
    id: 'glassAmulet',
    name: 'Glass amulet',
    blurb: 'All damage up. Fragile.',
    rarity: 3,
    price: 34,
    mods: { strength: 3, ranged: 3, magic: 3, hitpoints: -3 },
  },
  {
    id: 'warlordBelt',
    name: "Warlord's belt",
    blurb: 'Everything, a bit more.',
    rarity: 4,
    price: 60,
    mods: { attack: 4, strength: 2, defence: 2, hitpoints: 2 },
  },
];

export const ITEMS_BY_ID: ReadonlyMap<string, ItemDef> = new Map(ITEMS.map((item) => [item.id, item]));
