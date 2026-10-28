/**
 * Weapons auto-fire at the nearest enemy in range (PLAN.md §2). Phase 1 ships
 * five bronze-tier weapons; tiers and merging arrive in Phase 4.
 *
 * Times are in seconds, distances in wu, speeds in wu/s. Knockback is an
 * impulse in wu/s that the target's mass divides.
 */

export type WeaponId = 'scimitar' | 'dagger' | 'shortbow' | 'staff' | 'boomchin';
export type WeaponClass = 'melee' | 'ranged' | 'magic';

interface WeaponBase {
  readonly id: WeaponId;
  readonly name: string;
  readonly blurb: string;
  readonly class: WeaponClass;
  readonly damage: number;
  readonly cooldown: number;
  /** Targets must be within this distance of Bob. */
  readonly range: number;
  /** Fraction 0..1. */
  readonly critChance: number;
  readonly critMultiplier: number;
  readonly knockback: number;
  readonly price: number;
}

/** Instant hit on every enemy inside a cone towards the target. */
export interface ArcWeapon extends WeaponBase {
  readonly pattern: 'arc';
  /** Cosine of the cone's half-angle. */
  readonly arcCos: number;
}

/** A flying projectile that hits what it touches. */
export interface ProjectileWeapon extends WeaponBase {
  readonly pattern: 'projectile';
  readonly speed: number;
  readonly projectileRadius: number;
  /** Extra enemies a projectile passes through. */
  readonly pierce: number;
  /** Damage radius around each hit (0 = single target). */
  readonly splash: number;
}

/** Thrown at a spot, explodes on landing. Ignores enemies in flight. */
export interface LobWeapon extends WeaponBase {
  readonly pattern: 'lob';
  readonly flightTime: number;
  readonly splash: number;
}

export type WeaponDef = ArcWeapon | ProjectileWeapon | LobWeapon;

export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  scimitar: {
    id: 'scimitar',
    name: 'Scimitar',
    blurb: 'Wide slash at the nearest enemy. Good knockback.',
    class: 'melee',
    pattern: 'arc',
    damage: 9,
    cooldown: 0.85,
    range: 78,
    arcCos: 0.42,
    critChance: 0.05,
    critMultiplier: 1.75,
    knockback: 220,
    price: 15,
  },
  dagger: {
    id: 'dagger',
    name: 'Dagger',
    blurb: 'Very fast, short stab. Crits often.',
    class: 'melee',
    pattern: 'arc',
    damage: 5,
    cooldown: 0.42,
    range: 60,
    arcCos: 0.87,
    critChance: 0.3,
    critMultiplier: 2,
    knockback: 60,
    price: 12,
  },
  shortbow: {
    id: 'shortbow',
    name: 'Shortbow',
    blurb: 'Rapid arrows at range.',
    class: 'ranged',
    pattern: 'projectile',
    damage: 6,
    cooldown: 0.6,
    range: 380,
    speed: 720,
    projectileRadius: 5,
    pierce: 0,
    splash: 0,
    critChance: 0.05,
    critMultiplier: 1.75,
    knockback: 90,
    price: 15,
  },
  staff: {
    id: 'staff',
    name: 'Elemental staff',
    blurb: 'Slow magic bolt that bursts on impact.',
    class: 'magic',
    pattern: 'projectile',
    damage: 9,
    cooldown: 1,
    range: 340,
    speed: 400,
    projectileRadius: 8,
    pierce: 0,
    splash: 38,
    critChance: 0.05,
    critMultiplier: 1.5,
    knockback: 120,
    price: 18,
  },
  boomchin: {
    id: 'boomchin',
    name: 'Boomchin',
    blurb: 'Lobbed critter that explodes where it lands.',
    class: 'ranged',
    pattern: 'lob',
    damage: 11,
    cooldown: 1.5,
    range: 300,
    flightTime: 0.55,
    splash: 62,
    critChance: 0.05,
    critMultiplier: 1.5,
    knockback: 260,
    price: 20,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as readonly WeaponId[];
/** Weapon slots per player. */
export const MAX_WEAPONS = 6;
