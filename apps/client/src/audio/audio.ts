import type { SimEvent } from '@game/sim';
import type { MusicEngine, MusicScene } from './music';
import { Sfx } from './sfx';
import type { UiSound } from './sfx-bank';

const MUTE_KEY = 'bob.muted';
const MUSIC_KEY = 'bob.music';
const SFX_LEVEL = 0.8;
/** Intensity changes smaller than this aren't worth a new fade. */
const INTENSITY_STEP = 0.03;
const INTENSITY_INTERVAL_MS = 500;

/**
 * Owns the one AudioContext that SFX and music share: unlocking it on the
 * first gesture (PLAN.md §5 mobile notes), suspending it while muted or
 * hidden, and loading the music engine lazily so Tone.js stays out of the
 * first download.
 */
export class GameAudio {
  muted = readFlag(MUTE_KEY, false);
  musicOn = readFlag(MUSIC_KEY, true);
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: Sfx | null = null;
  private music: MusicEngine | null = null;
  private musicLoading = false;
  private scene: MusicScene = 'title';
  private intensity = 0;
  private lastIntensityAt = 0;
  private ducked = false;

  constructor() {
    // Kept for the whole session: iOS can interrupt the context at any time,
    // and only a gesture may resume it.
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('touchend', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => this.syncRunning());
  }

  /** `listenerX` is Bob's position, for panning. */
  handle(events: readonly SimEvent[], listenerX: number): void {
    this.sfx?.handle(events, listenerX);
  }

  /** Menu feedback: clicks, purchases, refusals, upgrade picks. */
  ui(kind: UiSound): void {
    this.sfx?.ui(kind);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    writeFlag(MUTE_KEY, this.muted);
    this.syncRunning();
    return this.muted;
  }

  toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    writeFlag(MUSIC_KEY, this.musicOn);
    this.music?.setEnabled(this.musicOn);
    if (this.musicOn) void this.loadMusic();
    return this.musicOn;
  }

  /** Called every frame; forwards only what changed. */
  update(scene: MusicScene, intensity: number, ducked: boolean): void {
    if (scene !== this.scene) {
      this.scene = scene;
      this.music?.setIntensity(intensity);
      this.intensity = intensity;
      this.music?.setScene(scene);
    }
    const now = performance.now();
    if (
      Math.abs(intensity - this.intensity) >= INTENSITY_STEP &&
      now - this.lastIntensityAt >= INTENSITY_INTERVAL_MS
    ) {
      this.intensity = intensity;
      this.lastIntensityAt = now;
      this.music?.setIntensity(intensity);
    }
    if (ducked !== this.ducked) {
      this.ducked = ducked;
      this.music?.setDucked(ducked);
    }
  }

  private unlock(): void {
    if (!this.ctx) {
      try {
        // iOS: play through the silent switch where supported.
        const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
        if (session) session.type = 'playback';
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      // A safety limiter: only a pile-up of SFX on a loud bar should reach it.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -4;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.15;
      limiter.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.connect(limiter);
      const sfxBus = this.ctx.createGain();
      sfxBus.gain.value = SFX_LEVEL;
      sfxBus.connect(this.master);
      this.sfx = new Sfx(this.ctx, sfxBus);
    }
    this.syncRunning();
    if (this.musicOn) void this.loadMusic();
  }

  /** Muted or hidden means a suspended context: silence that costs no CPU. */
  private syncRunning(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const run = !this.muted && !document.hidden;
    if (run && ctx.state !== 'running') ctx.resume().catch(() => {});
    else if (!run && ctx.state === 'running') void ctx.suspend();
  }

  private async loadMusic(): Promise<void> {
    if (this.music || this.musicLoading || !this.ctx || !this.master) return;
    this.musicLoading = true;
    try {
      Object.assign(window, { TONE_SILENCE_LOGGING: true });
      const { createToneMusic } = await import('./tone-music');
      const music = await createToneMusic({ context: this.ctx, output: this.master });
      music.setEnabled(this.musicOn);
      music.setIntensity(this.intensity);
      music.setDucked(this.ducked);
      music.setScene(this.scene);
      this.music = music;
    } catch (error) {
      console.warn('Music failed to load', error);
    } finally {
      this.musicLoading = false;
    }
  }
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Private mode or blocked storage: the setting just won't persist.
  }
}
