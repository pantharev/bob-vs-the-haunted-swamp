import {
  SKILL_IDS,
  type CharacterDef,
  type EnemyDef,
  type EnemyId,
  type Rarity,
  type SkillId,
  type StatKey,
  type WaveDef,
  type WeaponId,
  type ZoneDef,
} from '@game/content';
import type { PickupKind, RunOutcome, SimEvent } from './events';
import { SpatialGrid } from './grid';
import { Rng } from './rng';

export type RunPhase = 'wave' | 'intermission' | 'over';
/** Where a player is between waves. Co-op players each go at their own pace. */
export type Intermission = 'levelUp' | 'shop' | 'ready';

export interface OwnedWeapon {
  readonly id: WeaponId;
  /** Ticks until it can fire again. */
  cooldown: number;
}

export interface UpgradeOffer {
  readonly skill: SkillId;
  readonly rarity: Rarity;
  readonly points: number;
}

export interface ShopOffer {
  readonly kind: 'weapon' | 'item';
  /** A WeaponId or an item id. */
  readonly id: string;
  readonly rarity: Rarity;
  readonly price: number;
  locked: boolean;
  sold: boolean;
}

export interface Player {
  readonly id: number;
  readonly character: CharacterDef;
  x: number;
  y: number;
  /** Position at the start of the latest tick, for render interpolation. */
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  readonly radius: number;
  /** Current top speed (wu/s), after stats. */
  moveSpeed: number;
  alive: boolean;
  hp: number;
  maxHp: number;
  /** Ticks of invulnerability left after being hit. */
  invulnerable: number;
  /** Co-op: ticks of revive progress while downed (`alive` false). */
  revive: number;
  /** Was down when the last wave ended: starts the next one with REVIVE.hp. */
  returning: boolean;
  /** Fractional HP accumulated by regen. */
  regenCarry: number;
  /** Standing in slime goo this tick. */
  slowed: boolean;
  level: number;
  xp: number;
  /** Levels gained this wave, spent on upgrade picks after it. */
  pendingLevels: number;
  coins: number;
  /** Coins left on the ground last wave; each pickup pays out double until it is empty. */
  bank: number;
  /** Skill points from level-ups. */
  readonly skills: Record<SkillId, number>;
  /** Skill points including item bonuses. */
  skillTotals: Record<SkillId, number>;
  /** Item id → copies owned. */
  readonly items: Record<string, number>;
  readonly weapons: OwnedWeapon[];
  /** Derived from skills and items by `recomputeStats`. */
  stats: Record<StatKey, number>;
  intermission: Intermission;
  upgrades: UpgradeOffer[];
  shop: ShopOffer[];
  /** Rerolls bought in the current shop. */
  rerolls: number;
}

export type EnemyAction = 'walk' | 'telegraph' | 'lunge';

export interface Enemy {
  id: number;
  def: EnemyDef;
  elite: boolean;
  alive: boolean;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Walking velocity. */
  vx: number;
  vy: number;
  /** Knockback velocity, decays each tick. */
  kx: number;
  ky: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  damage: number;
  mass: number;
  coins: number;
  /** Crawling hands circle in from one side. */
  flankSide: 1 | -1;
  /** Werewolf state. */
  transformed: boolean;
  action: EnemyAction;
  actionTicks: number;
  cooldown: number;
  dirX: number;
  dirY: number;
}

export interface Projectile {
  id: number;
  alive: boolean;
  owner: number;
  weapon: WeaponId;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  /** Ticks left before it fizzles. */
  life: number;
  pierce: number;
  /** Enemy ids already hit, so piercing shots hit each enemy once. */
  readonly hits: number[];
  /** Lobbed shots fly from start to target over `flight` ticks. */
  lob: boolean;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  age: number;
  flight: number;
}

export interface Pickup {
  id: number;
  alive: boolean;
  kind: PickupKind;
  value: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  /** Player index it is flying to, or -1. */
  target: number;
  speed: number;
}

export interface SpawnMarker {
  id: number;
  enemy: EnemyId;
  count: number;
  elite: boolean;
  x: number;
  y: number;
  ticks: number;
}

export interface Goo {
  id: number;
  x: number;
  y: number;
  radius: number;
  ticks: number;
  duration: number;
}

export interface Arena {
  readonly width: number;
  readonly height: number;
}

export interface RunStats {
  kills: number;
  damageDealt: number;
  coinsCollected: number;
  /** Ticks spent inside waves. */
  timeTicks: number;
  /** killPoints + waveBonus + victoryBonus (see SCORE in content). */
  score: number;
  killPoints: number;
  waveBonus: number;
  victoryBonus: number;
}

export interface World {
  readonly seed: number;
  /** Sim ticks run (waves only; intermissions don't tick). */
  tick: number;
  readonly rng: Rng;
  readonly arena: Arena;
  readonly waves: readonly WaveDef[];
  phase: RunPhase;
  outcome: RunOutcome | null;
  /** Current (or last finished) wave, 1-based. */
  wave: number;
  waveTick: number;
  waveTicks: number;
  /** Wave tick at which each spawn rule fires next. */
  ruleNext: number[];
  readonly players: Player[];
  readonly enemies: Enemy[];
  readonly projectiles: Projectile[];
  readonly pickups: Pickup[];
  readonly markers: SpawnMarker[];
  readonly goo: Goo[];
  nextId: number;
  readonly grid: SpatialGrid;
  /** Produced by the latest step/applyAction; cleared at the start of each. */
  readonly events: SimEvent[];
  readonly stats: RunStats;
  /** Recycled dead entities, so long runs don't churn the GC. */
  readonly pools: {
    readonly enemies: Enemy[];
    readonly projectiles: Projectile[];
    readonly pickups: Pickup[];
  };
}

export function createPlayer(
  id: number,
  character: CharacterDef,
  weapons: readonly WeaponId[],
): Player {
  const skills = Object.fromEntries(SKILL_IDS.map((s) => [s, 0])) as Record<SkillId, number>;
  return {
    id,
    character,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    facing: 1,
    radius: character.radius,
    moveSpeed: character.moveSpeed,
    alive: true,
    hp: character.maxHp,
    maxHp: character.maxHp,
    invulnerable: 0,
    revive: 0,
    returning: false,
    regenCarry: 0,
    slowed: false,
    level: 1,
    xp: 0,
    pendingLevels: 0,
    coins: 0,
    bank: 0,
    skills,
    skillTotals: { ...skills },
    items: {},
    weapons: weapons.map((weapon) => ({ id: weapon, cooldown: 0 })),
    stats: {} as Record<StatKey, number>,
    intermission: 'ready',
    upgrades: [],
    shop: [],
    rerolls: 0,
  };
}

export function createWorldState(
  seed: number,
  zone: ZoneDef,
  players: Player[],
): World {
  const arena: Arena = { width: zone.width, height: zone.height };
  return {
    seed,
    tick: 0,
    rng: new Rng(seed),
    arena,
    waves: zone.waves,
    phase: 'wave',
    outcome: null,
    wave: 0,
    waveTick: 0,
    waveTicks: 0,
    ruleNext: [],
    players,
    enemies: [],
    projectiles: [],
    pickups: [],
    markers: [],
    goo: [],
    nextId: 1,
    grid: new SpatialGrid(arena.width, arena.height),
    events: [],
    stats: {
      kills: 0,
      damageDealt: 0,
      coinsCollected: 0,
      timeTicks: 0,
      score: 0,
      killPoints: 0,
      waveBonus: 0,
      victoryBonus: 0,
    },
    pools: { enemies: [], projectiles: [], pickups: [] },
  };
}
