import {
  ITEMS_BY_ID,
  SKILLS,
  STATS,
  WEAPONS,
  type ItemMods,
  type SkillId,
  type StatKey,
  type WeaponId,
} from '@game/content';
import type { ShopOffer } from '@game/sim';

/** Placeholder icons until Phase 2 art (PLAN.md §6). */
export const WEAPON_ICONS: Readonly<Record<WeaponId, string>> = {
  scimitar: '🗡️',
  dagger: '🔪',
  shortbow: '🏹',
  staff: '🪄',
  boomchin: '💣',
};

const ITEM_ICONS: Readonly<Record<string, string>> = {
  saltCharm: '🧂',
  silverDust: '✨',
  fortuneRing: '💍',
  trollBracer: '🩹',
  lantern: '🏮',
  weightedBoots: '🥾',
  spikedGauntlets: '🥊',
  featherCap: '🪶',
  quiver: '🎯',
  tome: '📖',
  thickCloak: '🧥',
  seedPouch: '🌱',
  huntersHood: '🪖',
  vampFang: '🦷',
  rabbitFoot: '🐇',
  glassAmulet: '🔮',
  warlordBelt: '🎗️',
};

export const SKILL_ICONS: Readonly<Record<SkillId, string>> = {
  hitpoints: '❤️',
  defence: '🛡️',
  agility: '🏃',
  attack: '⚔️',
  strength: '💪',
  ranged: '🏹',
  magic: '🔮',
  prayer: '🙏',
  thieving: '🎲',
  farming: '🌾',
  slayer: '💀',
};

export function itemIcon(id: string): string {
  return ITEM_ICONS[id] ?? '📦';
}

function number(value: number): string {
  return String(Math.round(Math.abs(value) * 10) / 10);
}

/** "+16% Melee damage", "−1 Agility", "+0.2 HP regen/s". */
export function formatStat(key: StatKey, value: number): string {
  const { label, unit } = STATS[key];
  const sign = value < 0 ? '−' : '+';
  return `${sign}${number(value)}${unit === '%' ? '%' : ''} ${label}${unit === '/s' ? '/s' : ''}`;
}

export function skillEffects(skill: SkillId, points: number): string[] {
  return SKILLS[skill].effects.map((e) => formatStat(e.stat, e.per * points));
}

export function modLines(mods: ItemMods): string[] {
  const lines: string[] = [];
  for (const key in mods) {
    const value = mods[key as keyof ItemMods] ?? 0;
    if (key in SKILLS) {
      lines.push(`${value < 0 ? '−' : '+'}${number(value)} ${SKILLS[key as SkillId].name}`);
    } else {
      lines.push(formatStat(key as StatKey, value));
    }
  }
  return lines;
}

export function weaponStats(id: WeaponId): string[] {
  const w = WEAPONS[id];
  const lines = [
    `${w.damage} damage · ${number(1 / w.cooldown)} hits/s`,
    `Range ${w.range} · ${w.class}`,
  ];
  if (w.critChance >= 0.2) lines.push(`${Math.round(w.critChance * 100)}% crit chance`);
  if (w.pattern !== 'arc' && w.splash > 0) lines.push(`Splash radius ${w.splash}`);
  return lines;
}

export function offerInfo(o: ShopOffer): { icon: string; name: string; blurb: string; lines: string[] } {
  if (o.kind === 'weapon') {
    const id = o.id as WeaponId;
    const w = WEAPONS[id];
    return { icon: WEAPON_ICONS[id], name: w.name, blurb: w.blurb, lines: weaponStats(id) };
  }
  const item = ITEMS_BY_ID.get(o.id);
  return {
    icon: itemIcon(o.id),
    name: item?.name ?? o.id,
    blurb: item?.blurb ?? '',
    lines: item ? modLines(item.mods) : [],
  };
}

export function formatTime(ticks: number): string {
  const total = Math.round(ticks / 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
