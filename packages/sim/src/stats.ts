import {
  ITEMS_BY_ID,
  SKILL_IDS,
  SKILLS,
  STATS,
  type SkillId,
  type StatKey,
  type WeaponClass,
} from '@game/content';
import type { Player } from './world';

const STAT_KEYS = Object.keys(STATS) as readonly StatKey[];
/** Armour points that halve incoming damage. */
const ARMOUR_HALF = 15;
const MAX_DODGE = 60;

function isSkill(key: string): key is SkillId {
  return key in SKILLS;
}

/**
 * Rebuilds a player's derived stats from skill points and items. Raising max
 * HP heals by the same amount, like gaining a Hitpoints level.
 */
export function recomputeStats(p: Player): void {
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as Record<StatKey, number>;
  const skills = { ...p.skills };

  for (const id in p.items) {
    const count = p.items[id] ?? 0;
    const mods = ITEMS_BY_ID.get(id)?.mods;
    if (!mods) continue;
    for (const key in mods) {
      const value = (mods[key as keyof typeof mods] ?? 0) * count;
      if (isSkill(key)) skills[key] += value;
      else stats[key as StatKey] += value;
    }
  }
  for (const skill of SKILL_IDS) {
    for (const effect of SKILLS[skill].effects) stats[effect.stat] += effect.per * skills[skill];
  }

  p.stats = stats;
  p.skillTotals = skills;

  const maxHp = Math.max(1, Math.round(p.character.maxHp + (p.level - 1) + stats.maxHp));
  if (maxHp > p.maxHp) p.hp += maxHp - p.maxHp;
  p.maxHp = maxHp;
  p.hp = Math.min(p.hp, p.maxHp);
  p.moveSpeed = p.character.moveSpeed * Math.max(0.4, 1 + stats.moveSpeed / 100);
}

/** Multiplier on incoming damage. Negative armour makes hits hurt more. */
export function armourFactor(armour: number): number {
  return armour >= 0 ? ARMOUR_HALF / (ARMOUR_HALF + armour) : (ARMOUR_HALF - armour) / ARMOUR_HALF;
}

export function dodgeChance(p: Player): number {
  return Math.min(MAX_DODGE, Math.max(0, p.stats.dodge)) / 100;
}

export function attackSpeedMultiplier(p: Player): number {
  return Math.max(0.3, 1 + p.stats.attackSpeed / 100);
}

export function classDamageMultiplier(p: Player, weaponClass: WeaponClass): number {
  const bonus =
    weaponClass === 'melee'
      ? p.stats.meleeDamage
      : weaponClass === 'ranged'
        ? p.stats.rangedDamage
        : p.stats.magicDamage;
  return Math.max(0.1, 1 + bonus / 100);
}

export function aoeMultiplier(p: Player): number {
  return Math.max(0.5, 1 + p.stats.aoeSize / 100);
}

export function pickupRange(p: Player): number {
  return p.character.pickupRange * Math.max(0.5, 1 + p.stats.pickupRange / 100);
}

/** XP needed to go from `level` to the next one. */
export function xpToNext(level: number): number {
  return (level + 2) * (level + 2);
}
