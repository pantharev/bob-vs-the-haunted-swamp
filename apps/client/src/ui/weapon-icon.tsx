import { TIERS, WEAPONS, type Tier, type WeaponId } from '@game/content';
import { tierCss, WEAPON_ICONS, weaponName } from './format';

/** A weapon's icon in a ring of its metal's colour. */
export function WeaponIcon({
  id,
  tier,
  class: extra,
}: {
  id: WeaponId;
  tier: Tier;
  class?: string;
}) {
  return (
    <span
      class={extra ? `weapon-icon ${extra}` : 'weapon-icon'}
      style={{ '--tier': tierCss(tier) }}
      title={weaponName(id, tier)}
    >
      {WEAPON_ICONS[id]}
    </span>
  );
}

/**
 * Every weapon at a glance: its icon, with the metal and the weapon named under it. A tile only
 * mounts (and pops in) when that weapon is new, so a buy or a merge shows where it went.
 */
export function Loadout({
  weapons,
  slots = 0,
  class: extra,
}: {
  weapons: readonly { readonly id: WeaponId; readonly tier: Tier }[];
  /** Pad with empty tiles up to this many. */
  slots?: number;
  class?: string;
}) {
  const seen = new Map<string, number>();
  return (
    <ul class={extra ? `loadout ${extra}` : 'loadout'} aria-label="Your weapons">
      {weapons.map(({ id, tier }) => {
        const kind = `${id}:${tier}`;
        const n = (seen.get(kind) ?? 0) + 1;
        seen.set(kind, n);
        return (
          <li key={`${kind}#${n}`} style={{ '--tier': tierCss(tier) }} title={weaponName(id, tier)}>
            <WeaponIcon id={id} tier={tier} />
            <span class="metal">{TIERS[tier].name}</span>
            <span class="kind">{WEAPONS[id].name}</span>
          </li>
        );
      })}
      {Array.from({ length: Math.max(0, slots - weapons.length) }, (_, i) => (
        <li key={`empty-${i}`} class="empty" aria-hidden="true" />
      ))}
    </ul>
  );
}
