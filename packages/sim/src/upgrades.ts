import { SKILL_IDS, type Rarity } from '@game/content';
import type { Rng } from './rng';
import type { Player, UpgradeOffer, World } from './world';

export const UPGRADE_CHOICES = 4;

/** Rolls 4 different skills, each with a rarity that grows with level and luck. */
export function rollUpgrades(world: World, p: Player): void {
  const pool = [...SKILL_IDS];
  const offers: UpgradeOffer[] = [];
  for (let i = 0; i < UPGRADE_CHOICES && pool.length > 0; i++) {
    const [skill] = pool.splice(world.rng.int(0, pool.length - 1), 1);
    if (!skill) break;
    const rarity = upgradeRarity(world.rng, p.level, p.stats.luck);
    offers.push({ skill, rarity, points: rarity });
  }
  p.upgrades = offers;
}

function upgradeRarity(rng: Rng, level: number, luck: number): Rarity {
  const luckMul = 1 + Math.max(0, luck) / 100;
  const p4 = Math.max(0, (level - 9) * 0.01) * luckMul;
  const p3 = Math.max(0, (level - 4) * 0.025) * luckMul;
  const p2 = Math.min(0.6, (0.1 + level * 0.04) * luckMul);
  return rollTier(rng, p2, p3, p4);
}

/** Picks a tier from independent-looking chances, rarest first. */
export function rollTier(rng: Rng, p2: number, p3: number, p4: number): Rarity {
  const roll = rng.next();
  if (roll < p4) return 4;
  if (roll < p4 + p3) return 3;
  if (roll < p4 + p3 + p2) return 2;
  return 1;
}
