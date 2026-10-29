import type { EnemyId, WeaponId } from '@game/content';
import type { SimEvent } from '@game/sim';
import { renderSfx, SFX, SFX_IDS, type SfxId, type UiSound } from './sfx-bank';
import { SAMPLE_RATE } from './synth';

/** Above this many sounds at once, only priority 1 and 2 sounds start. */
const SOFT_CAP = 18;
/** Above this many, only priority 2 (Bob, elites, wave calls) still starts. */
const HARD_CAP = 28;
/** Coins picked up closer together than this climb the scale. */
const COIN_STREAK = 0.45;
/** D minor pentatonic, the waltz's key, up one octave. */
const COIN_STEPS = [0, 3, 5, 7, 10, 12];
/** How far off-centre a sound can sit, and the distance (wu) that reaches it. */
const PAN_WIDTH = 0.6;
const PAN_DISTANCE = 600;

const ATTACK: Readonly<Record<WeaponId, SfxId>> = {
  scimitar: 'swingScimitar',
  dagger: 'swingDagger',
  shortbow: 'shootBow',
  staff: 'castStaff',
  boomchin: 'throwBoomchin',
};

/** Splash weapons sound once through their burst, not once per enemy caught in it. */
const IMPACT: Readonly<Record<WeaponId, SfxId | null>> = {
  scimitar: 'hitBlade',
  dagger: 'hitBlade',
  shortbow: 'hitArrow',
  staff: null,
  boomchin: null,
};

const BURST: Readonly<Partial<Record<WeaponId, SfxId>>> = {
  staff: 'burstStaff',
  boomchin: 'boomBoomchin',
};

/** Death sound and playback rate per enemy. */
const DEATH: Readonly<Record<EnemyId, readonly [SfxId, number]>> = {
  zombie: ['dieZombie', 1],
  hand: ['dieHand', 1],
  slime: ['dieSlime', 1],
  slimeMedium: ['dieSlime', 1.3],
  slimeSmall: ['dieSlimeSmall', 1],
  werewolf: ['dieWerewolf', 1],
};

interface PlayOptions {
  /** -1 (left) .. 1 (right). */
  pan?: number;
  /** Playback rate before the random jitter. */
  rate?: number;
}

/**
 * Plays the SFX bank on the shared AudioContext. Sounds are rendered lazily
 * (and warmed in idle time after the first tap), so a shot costs one buffer
 * source. `VoicePool` keeps a horde from turning into noise.
 */
export class Sfx {
  private readonly buffers = new Map<SfxId, AudioBuffer[]>();
  private readonly pool = new VoicePool();
  private coinStep = 0;
  private lastCoin = -Infinity;

  constructor(
    private readonly ctx: AudioContext,
    private readonly output: AudioNode,
  ) {
    this.warm([...SFX_IDS]);
  }

  /** `listenerX` is your Bob's position, for panning; `me` is your player, whose own hits and pickups you hear. */
  handle(events: readonly SimEvent[], listenerX: number, me = 0): void {
    if (this.ctx.state !== 'running') return;
    const runOver = events.some((ev) => ev.type === 'runOver');
    for (const ev of events) {
      switch (ev.type) {
        case 'attack':
          this.play(ATTACK[ev.weapon]);
          break;
        case 'enemyHit': {
          const id = ev.crit ? 'crit' : ev.weapon && IMPACT[ev.weapon];
          if (id) this.play(id, { pan: pan(ev.x, listenerX) });
          break;
        }
        case 'explosion':
          this.play(BURST[ev.weapon] ?? 'boomBoomchin', { pan: pan(ev.x, listenerX) });
          break;
        case 'enemyDeath': {
          // Enemies swept away at the end of a wave go quietly.
          if (ev.cleared) break;
          const [id, rate] = DEATH[ev.enemy];
          this.play(id, { pan: pan(ev.x, listenerX), rate });
          if (ev.elite) this.play('dieElite', { pan: pan(ev.x, listenerX) });
          break;
        }
        case 'transform':
          this.play('howl');
          break;
        case 'telegraph':
          this.play('snarl');
          break;
        case 'lunge':
          this.play('lunge');
          break;
        case 'playerHit':
          if (ev.player !== me) break;
          if (ev.dodged) {
            this.play('dodge');
          } else {
            this.play('hurt');
            navigator.vibrate?.(30);
          }
          break;
        case 'playerDeath':
          this.play('death');
          break;
        case 'playerRevive':
          this.play('levelUp');
          break;
        case 'pickup':
          if (ev.player !== me) break;
          if (ev.kind === 'food') this.play('food');
          else this.coin(ev.value > 1);
          break;
        case 'levelUp':
          if (ev.player === me) this.play('levelUp');
          break;
        case 'waveStart':
          this.play('waveStart');
          break;
        case 'waveEnd':
          // The last wave ends in the victory bells instead.
          if (!runOver) this.play('waveEnd');
          break;
        case 'runOver':
          // Defeat already has Bob's death.
          if (ev.outcome === 'victory') this.play('victory');
          break;
        case 'heal':
          break;
      }
    }
  }

  ui(id: UiSound): void {
    this.play(id);
  }

  private play(id: SfxId, { pan = 0, rate = 1 }: PlayOptions = {}): void {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    const def = SFX[id];
    const takes = this.load(id);
    const buffer = takes[Math.floor(Math.random() * takes.length)]!;
    const r = rate * Math.pow(2, ((Math.random() * 2 - 1) * def.jitter) / 12);
    const now = ctx.currentTime;
    if (!this.pool.admit(id, now, buffer.duration / r)) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = r;
    if (pan !== 0) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      src.connect(panner).connect(this.output);
    } else {
      src.connect(this.output);
    }
    src.start(now);
  }

  private coin(big: boolean): void {
    const now = this.ctx.currentTime;
    this.coinStep =
      now - this.lastCoin < COIN_STREAK ? Math.min(this.coinStep + 1, COIN_STEPS.length - 1) : 0;
    this.lastCoin = now;
    this.play(big ? 'coinBig' : 'coin', { rate: Math.pow(2, COIN_STEPS[this.coinStep]! / 12) });
  }

  private load(id: SfxId): AudioBuffer[] {
    let takes = this.buffers.get(id);
    if (!takes) {
      takes = renderSfx(id).map((data) => {
        const buffer = this.ctx.createBuffer(1, data.length, SAMPLE_RATE);
        buffer.copyToChannel(data, 0);
        return buffer;
      });
      this.buffers.set(id, takes);
    }
    return takes;
  }

  /** Renders the bank a sound at a time while the browser is idle. */
  private warm(queue: SfxId[]): void {
    // Safari has no requestIdleCallback.
    const idle =
      'requestIdleCallback' in window
        ? (fn: () => void) => window.requestIdleCallback(fn, { timeout: 500 })
        : (fn: () => void) => window.setTimeout(fn, 16);
    const next = () => {
      const id = queue.shift();
      if (!id) return;
      this.load(id);
      idle(next);
    };
    idle(next);
  }
}

/**
 * Decides whether a sound may start: no closer than its `gap` to the last
 * one, no more than its `voices` at once, and a global cap where the lowest
 * priorities drop out first.
 */
export class VoicePool {
  private readonly playing = new Map<SfxId, number[]>();
  private readonly lastStart = new Map<SfxId, number>();
  private all: number[] = [];

  /** `now` and `duration` in seconds. Records the voice when it says yes. */
  admit(id: SfxId, now: number, duration: number): boolean {
    const def = SFX[id];
    if (now - (this.lastStart.get(id) ?? -Infinity) < def.gap) return false;
    const mine = (this.playing.get(id) ?? []).filter((end) => end > now);
    if (mine.length >= def.voices) return false;
    this.all = this.all.filter((end) => end > now);
    const cap = def.priority === 0 ? SOFT_CAP : def.priority === 1 ? HARD_CAP : Infinity;
    if (this.all.length >= cap) return false;

    mine.push(now + duration);
    this.playing.set(id, mine);
    this.all.push(now + duration);
    this.lastStart.set(id, now);
    return true;
  }
}

function pan(x: number, listenerX: number): number {
  return Math.max(-1, Math.min(1, (x - listenerX) / PAN_DISTANCE)) * PAN_WIDTH;
}
