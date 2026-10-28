/**
 * Skills are the level-up stats (PLAN.md §2). Each point of a skill adds to
 * one or more derived stats; the sim and the UI both read these tables, so the
 * numbers on a card always match what the run actually does.
 */

/**
 * Derived stats. Units are in the STATS table below: percent stats are in
 * percent points (6 = +6%), `regen` is HP/s, `harvest` is coins per wave.
 */
export type StatKey =
  | 'maxHp'
  | 'armour'
  | 'moveSpeed'
  | 'dodge'
  | 'attackSpeed'
  | 'meleeDamage'
  | 'rangedDamage'
  | 'magicDamage'
  | 'aoeSize'
  | 'regen'
  | 'luck'
  | 'harvest'
  | 'slayerDamage'
  | 'undeadDamage'
  | 'beastDamage'
  | 'pickupRange'
  | 'lifesteal'
  | 'critChance';

export type SkillId =
  | 'hitpoints'
  | 'defence'
  | 'agility'
  | 'attack'
  | 'strength'
  | 'ranged'
  | 'magic'
  | 'prayer'
  | 'thieving'
  | 'farming'
  | 'slayer';

export interface SkillEffect {
  readonly stat: StatKey;
  /** Stat gained per skill point. */
  readonly per: number;
}

export interface SkillDef {
  readonly id: SkillId;
  readonly name: string;
  readonly effects: readonly SkillEffect[];
}

export const SKILLS: Readonly<Record<SkillId, SkillDef>> = {
  hitpoints: { id: 'hitpoints', name: 'Hitpoints', effects: [{ stat: 'maxHp', per: 3 }] },
  defence: { id: 'defence', name: 'Defence', effects: [{ stat: 'armour', per: 1 }] },
  agility: {
    id: 'agility',
    name: 'Agility',
    effects: [
      { stat: 'moveSpeed', per: 3 },
      { stat: 'dodge', per: 1 },
    ],
  },
  attack: { id: 'attack', name: 'Attack', effects: [{ stat: 'attackSpeed', per: 5 }] },
  strength: { id: 'strength', name: 'Strength', effects: [{ stat: 'meleeDamage', per: 8 }] },
  ranged: { id: 'ranged', name: 'Ranged', effects: [{ stat: 'rangedDamage', per: 8 }] },
  magic: {
    id: 'magic',
    name: 'Magic',
    effects: [
      { stat: 'magicDamage', per: 8 },
      { stat: 'aoeSize', per: 4 },
    ],
  },
  prayer: { id: 'prayer', name: 'Prayer', effects: [{ stat: 'regen', per: 0.1 }] },
  thieving: { id: 'thieving', name: 'Thieving', effects: [{ stat: 'luck', per: 5 }] },
  farming: { id: 'farming', name: 'Farming', effects: [{ stat: 'harvest', per: 3 }] },
  slayer: { id: 'slayer', name: 'Slayer', effects: [{ stat: 'slayerDamage', per: 10 }] },
};

export const SKILL_IDS = Object.keys(SKILLS) as readonly SkillId[];

export interface StatInfo {
  readonly label: string;
  /** Unit suffix for display. */
  readonly unit: '' | '%' | '/s';
}

export const STATS: Readonly<Record<StatKey, StatInfo>> = {
  maxHp: { label: 'Max HP', unit: '' },
  armour: { label: 'Armour', unit: '' },
  moveSpeed: { label: 'Move speed', unit: '%' },
  dodge: { label: 'Dodge', unit: '%' },
  attackSpeed: { label: 'Attack speed', unit: '%' },
  meleeDamage: { label: 'Melee damage', unit: '%' },
  rangedDamage: { label: 'Ranged damage', unit: '%' },
  magicDamage: { label: 'Magic damage', unit: '%' },
  aoeSize: { label: 'Explosion size', unit: '%' },
  regen: { label: 'HP regen', unit: '/s' },
  luck: { label: 'Luck', unit: '' },
  harvest: { label: 'Harvest per wave', unit: '' },
  slayerDamage: { label: 'Damage vs tough', unit: '%' },
  undeadDamage: { label: 'Damage vs undead', unit: '%' },
  beastDamage: { label: 'Damage vs beasts', unit: '%' },
  pickupRange: { label: 'Pickup range', unit: '%' },
  lifesteal: { label: 'Life steal', unit: '%' },
  critChance: { label: 'Crit chance', unit: '%' },
};

/** Rarity tiers shared by level-up cards and shop items. */
export type Rarity = 1 | 2 | 3 | 4;
export const RARITY_NAMES: Readonly<Record<Rarity, string>> = {
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Legendary',
};
