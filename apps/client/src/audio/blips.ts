import type { SimEvent } from '@game/sim';

/**
 * Phase 1 placeholder sound (PLAN.md §10): tiny oscillator blips straight on
 * Web Audio, no samples. Tone.js and real SFX arrive in Phase 2. Busy sounds
 * are rate-limited so a horde doesn't turn into white noise.
 */

type Wave = OscillatorType;

interface Tone {
  wave: Wave;
  from: number;
  to: number;
  /** Seconds. */
  length: number;
  gain: number;
  delay?: number;
}

const MUTE_KEY = 'bob.muted';

export class Blips {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly lastPlayed = new Map<string, number>();
  private coinStreak = 0;
  private lastCoin = 0;
  muted = readMuted();

  constructor() {
    // Browsers only allow audio after a user gesture (PLAN.md §5 mobile notes).
    const unlock = () => {
      this.unlock();
      if (this.ctx?.state === 'running') {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Private mode or blocked storage: the setting just won't persist.
    }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  handle(events: readonly SimEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'enemyHit':
          if (ev.crit) this.play('crit', 0.05, [{ wave: 'square', from: 900, to: 300, length: 0.07, gain: 0.08 }]);
          else this.play('hit', 0.035, [{ wave: 'square', from: 260, to: 90, length: 0.05, gain: 0.06 }]);
          break;
        case 'enemyDeath':
          if (ev.cleared) break;
          if (ev.elite) this.thud(0.4, 0.5);
          else this.play('death', 0.04, [{ wave: 'triangle', from: 320, to: 60, length: 0.09, gain: 0.09 }]);
          break;
        case 'attack':
          if (ev.weapon === 'shortbow') this.play('bow', 0.05, [{ wave: 'triangle', from: 1200, to: 500, length: 0.04, gain: 0.04 }]);
          else if (ev.weapon === 'staff') this.play('staff', 0.08, [{ wave: 'sine', from: 500, to: 1100, length: 0.12, gain: 0.05 }]);
          else if (ev.weapon === 'boomchin') this.play('throw', 0.08, [{ wave: 'sine', from: 300, to: 700, length: 0.1, gain: 0.04 }]);
          else this.whoosh();
          break;
        case 'explosion':
          this.thud(0.2, 0.3);
          break;
        case 'pickup':
          if (ev.kind === 'food') this.play('food', 0, chord([523, 659, 784], 0.07, 0.06, 'triangle'));
          else this.coin();
          break;
        case 'playerHit':
          if (ev.dodged) this.play('dodge', 0.05, [{ wave: 'sine', from: 700, to: 900, length: 0.06, gain: 0.05 }]);
          else this.play('hurt', 0.05, [{ wave: 'sawtooth', from: 180, to: 50, length: 0.18, gain: 0.12 }]);
          if (!ev.dodged) navigator.vibrate?.(30);
          break;
        case 'playerDeath':
          this.play('dead', 0, [
            { wave: 'sawtooth', from: 300, to: 40, length: 0.7, gain: 0.14 },
            { wave: 'square', from: 150, to: 30, length: 0.7, gain: 0.06 },
          ]);
          break;
        case 'levelUp':
          this.play('level', 0.1, chord([523, 659, 784, 1047], 0.08, 0.07, 'square'));
          break;
        case 'transform':
          this.play('growl', 0.1, [{ wave: 'sawtooth', from: 90, to: 140, length: 0.35, gain: 0.08 }]);
          break;
        case 'telegraph':
          this.play('telegraph', 0.05, [{ wave: 'square', from: 220, to: 240, length: 0.18, gain: 0.04 }]);
          break;
        case 'waveStart':
          this.play('waveStart', 0, chord([392, 523], 0.12, 0.07, 'triangle'));
          break;
        case 'waveEnd':
          this.play('waveEnd', 0, chord([523, 659, 784], 0.1, 0.07, 'triangle'));
          break;
        case 'runOver':
          if (ev.outcome === 'victory') this.play('victory', 0, chord([523, 659, 784, 1047, 1319], 0.12, 0.08, 'triangle'));
          break;
      }
    }
  }

  /** UI feedback: a click, a purchase, or a refusal. */
  ui(kind: 'click' | 'buy' | 'error'): void {
    if (kind === 'click') this.play('click', 0.03, [{ wave: 'square', from: 700, to: 700, length: 0.025, gain: 0.04 }]);
    else if (kind === 'buy') this.play('buy', 0, chord([784, 1175], 0.06, 0.06, 'square'));
    else this.play('error', 0.1, [{ wave: 'square', from: 140, to: 110, length: 0.12, gain: 0.06 }]);
  }

  private coin(): void {
    const now = performance.now();
    this.coinStreak = now - this.lastCoin < 400 ? Math.min(this.coinStreak + 1, 12) : 0;
    this.lastCoin = now;
    // Rising pitch while hoovering up a pile.
    const pitch = 1100 * Math.pow(2, this.coinStreak / 12);
    this.play('coin', 0.03, [{ wave: 'sine', from: pitch, to: pitch * 1.5, length: 0.05, gain: 0.05 }]);
  }

  private whoosh(): void {
    if (!this.ready('whoosh', 0.06) || !this.ctx || !this.noise) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.1);
    const gain = this.envelope(0.05, 0.1);
    src.connect(filter).connect(gain);
    src.start();
    src.stop(ctx.currentTime + 0.12);
  }

  private thud(volume: number, length: number): void {
    if (!this.ready('thud', 0.06) || !this.ctx || !this.noise) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + length);
    src.connect(filter).connect(this.envelope(volume, length));
    src.start();
    src.stop(ctx.currentTime + length + 0.02);
  }

  private play(key: string, minGap: number, tones: readonly Tone[]): void {
    if (!this.ready(key, minGap) || !this.ctx) return;
    const ctx = this.ctx;
    for (const t of tones) {
      const start = ctx.currentTime + (t.delay ?? 0);
      const osc = ctx.createOscillator();
      osc.type = t.wave;
      osc.frequency.setValueAtTime(t.from, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, t.to), start + t.length);
      osc.connect(this.envelope(t.gain, t.length, start));
      osc.start(start);
      osc.stop(start + t.length + 0.02);
    }
  }

  private envelope(volume: number, length: number, start = this.ctx?.currentTime ?? 0): GainNode {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    gain.connect(this.master!);
    return gain;
  }

  /** Rate limit per sound, and skip everything while muted or locked. */
  private ready(key: string, minGap: number): boolean {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(key) ?? -1) < minGap) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private unlock(): void {
    if (!this.ctx) {
      try {
        // iOS: play through the silent switch where supported.
        const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
        if (session) session.type = 'playback';
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.35;
      this.master.connect(this.ctx.destination);
      const length = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
}

function chord(freqs: readonly number[], step: number, gain: number, wave: Wave): Tone[] {
  return freqs.map((f, i) => ({ wave, from: f, to: f, length: step * 1.6, gain, delay: i * step }));
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
