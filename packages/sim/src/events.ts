import type { EnemyId, WeaponId } from '@game/content';

export type PickupKind = 'coin' | 'food';
export type RunOutcome = 'victory' | 'defeat';

/**
 * What happened during the latest `step` or `applyAction`. Audio, VFX and UI
 * react to these; later, network clients will consume the same stream.
 */
export type SimEvent =
  | {
      readonly type: 'enemyHit';
      readonly id: number;
      readonly x: number;
      readonly y: number;
      readonly amount: number;
      readonly crit: boolean;
    }
  | {
      readonly type: 'enemyDeath';
      readonly id: number;
      readonly enemy: EnemyId;
      readonly elite: boolean;
      readonly x: number;
      readonly y: number;
      /** Removed by the wave ending rather than killed. */
      readonly cleared: boolean;
    }
  | { readonly type: 'transform' | 'telegraph' | 'lunge'; readonly id: number }
  | {
      readonly type: 'playerHit';
      readonly player: number;
      readonly amount: number;
      readonly dodged: boolean;
    }
  | { readonly type: 'playerDeath'; readonly player: number }
  | {
      readonly type: 'attack';
      readonly player: number;
      readonly weapon: WeaponId;
      readonly x: number;
      readonly y: number;
      readonly dirX: number;
      readonly dirY: number;
    }
  | {
      readonly type: 'explosion';
      readonly weapon: WeaponId;
      readonly x: number;
      readonly y: number;
      readonly radius: number;
    }
  | {
      readonly type: 'pickup';
      readonly player: number;
      readonly kind: PickupKind;
      readonly value: number;
    }
  | { readonly type: 'heal'; readonly player: number; readonly amount: number }
  | { readonly type: 'levelUp'; readonly player: number; readonly level: number }
  | { readonly type: 'waveStart' | 'waveEnd'; readonly wave: number }
  | { readonly type: 'runOver'; readonly outcome: RunOutcome };
