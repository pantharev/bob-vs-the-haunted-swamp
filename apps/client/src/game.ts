import { ZONES, type WeaponId, type ZoneDef } from '@game/content';
import { applyAction, createWorld, DT, step, type RunAction, type World } from '@game/sim';
import type { Application } from 'pixi.js';
import type { GameAudio } from './audio/audio';
import type { MusicScene } from './audio/music';
import type { UiSound } from './audio/sfx-bank';
import type { DebugOverlay } from './debug/overlay';
import type { Input } from './input/input';
import type { GameView } from './render/game-view';

/** Longest frame we simulate; anything slower is treated as a hitch, not lost time. */
const MAX_FRAME_SECONDS = 0.25;
/** Cap on catch-up ticks per frame so a slow device can't spiral. */
const MAX_STEPS_PER_FRAME = 8;

/** Title screen backdrop: the real arena, nothing spawning. */
const BACKDROP_ZONE: ZoneDef = {
  ...ZONES.wolfmoor,
  waves: [{ duration: 1e6, hpScale: 1, damageScale: 1, spawns: [] }],
};

export type Screen = 'title' | 'run';

export interface RunOptions {
  weapon: WeaponId;
  seed?: number;
  /** Debug: start at a later wave. */
  wave?: number;
}

/**
 * Owns the run: the fixed-step loop, pausing, and the bridge between sim,
 * view, audio and the Preact UI (which re-renders on `subscribe`).
 */
export class Game {
  screen: Screen = 'title';
  paused = false;
  world: World;
  lastWeapon: WeaponId = 'scimitar';
  private accumulator = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly app: Application,
    private readonly view: GameView,
    private readonly input: Input,
    readonly audio: GameAudio,
    private readonly debug: DebugOverlay,
  ) {
    this.world = this.backdrop();
    app.ticker.add((ticker) => this.frame(ticker.deltaMS, ticker.FPS));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.setPaused(true);
      this.accumulator = 0;
      input.reset();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get inWave(): boolean {
    return this.screen === 'run' && this.world.phase === 'wave';
  }

  startRun({ weapon, seed, wave }: RunOptions): void {
    this.lastWeapon = weapon;
    this.world = createWorld({
      seed: seed ?? Date.now() >>> 0,
      zone: ZONES.wolfmoor,
      weapons: [weapon],
      startWave: wave,
    });
    this.view.setWorld(this.world);
    this.view.hudVisible = true;
    this.screen = 'run';
    this.paused = false;
    this.accumulator = 0;
    this.input.reset();
    this.audio.ui('start');
    this.consume();
    this.notify();
  }

  quitToTitle(): void {
    this.audio.ui('click');
    this.world = this.backdrop();
    this.screen = 'title';
    this.paused = false;
    this.notify();
  }

  setPaused(paused: boolean): void {
    const next = paused && this.inWave;
    if (next === this.paused) return;
    this.paused = next;
    this.audio.ui(next ? 'pause' : 'resume');
    this.input.reset();
    this.notify();
  }

  toggleMute(): void {
    this.audio.toggleMute();
    this.notify();
  }

  toggleMusic(): void {
    this.audio.toggleMusic();
    this.audio.ui('click');
    this.notify();
  }

  /** A between-wave choice from the UI. Returns false if the sim refused it. */
  act(action: RunAction): boolean {
    const sound = this.actionSound(action);
    const ok = applyAction(this.world, 0, action);
    this.audio.ui(ok ? sound : 'error');
    this.consume();
    if (ok && this.world.phase === 'wave') {
      this.accumulator = 0;
      this.input.reset();
    }
    this.notify();
    return ok;
  }

  private frame(deltaMS: number, fps: number): void {
    const frameSeconds = Math.min(deltaMS / 1000, MAX_FRAME_SECONDS);
    const world = this.world;
    const running = this.inWave && !this.paused;

    if (running) {
      this.accumulator += frameSeconds;
      const simStart = performance.now();
      let steps = 0;
      while (this.accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
        step(world, [this.input.sample()]);
        this.consume();
        this.accumulator -= DT;
        steps++;
        if (world.phase !== 'wave') {
          // Wave over or Bob died: freeze and hand over to the UI.
          this.accumulator = 0;
          this.input.reset();
          this.notify();
          break;
        }
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
      this.debug.recordSim(performance.now() - simStart, steps);
    }

    this.view.render(running ? this.accumulator / DT : 1, frameSeconds, this.input);
    this.audio.update(this.musicScene(), this.musicIntensity(), this.paused);

    this.debug.update(performance.now(), () => {
      const p = world.players[0];
      const { width, height } = this.app.screen;
      return [
        `fps ${fps.toFixed(0)}  tick ${world.tick}  seed ${world.seed}`,
        `enemies ${world.enemies.length}  shots ${world.projectiles.length}  loot ${world.pickups.length}`,
        `view ${width}×${height} @${this.app.renderer.resolution}x  scale ${this.view.camera.scale.toFixed(2)}`,
        p ? `bob ${p.x.toFixed(0)},${p.y.toFixed(0)}  hp ${p.hp}/${p.maxHp}` : 'no player',
      ];
    });
  }

  private musicScene(): MusicScene {
    if (this.screen === 'title') return 'title';
    switch (this.world.phase) {
      case 'wave':
        return 'wave';
      case 'intermission':
        return 'shop';
      case 'over':
        return this.world.outcome === 'victory' ? 'victory' : 'defeat';
    }
  }

  /** 0..1 from how far into the run we are and how crowded it is; elites push it to the top. */
  private musicIntensity(): number {
    const world = this.world;
    if (!this.inWave) return 0;
    const progress = (world.wave - 1) / Math.max(1, world.waves.length - 1);
    const crowd = Math.min(world.enemies.length / 120, 1);
    let intensity = 0.1 + 0.45 * progress + 0.45 * crowd;
    if (world.wave === world.waves.length) intensity = Math.max(intensity, 0.95);
    for (const enemy of world.enemies) {
      if (enemy.elite) return Math.max(intensity, 0.9);
    }
    return Math.min(intensity, 1);
  }

  /** Read before the action applies: the pick's rarity, the lock's state. */
  private actionSound(action: RunAction): UiSound {
    const p = this.world.players[0];
    switch (action.type) {
      case 'chooseUpgrade':
        return `pick${p?.upgrades[action.index]?.rarity ?? 1}`;
      case 'buy':
        return 'buy';
      case 'reroll':
        return 'reroll';
      case 'toggleLock':
        return p?.shop[action.index]?.locked ? 'unlock' : 'lock';
      case 'sellWeapon':
        return 'sell';
      case 'ready':
        // The wave's own horn follows straight away.
        return 'click';
    }
  }

  private consume(): void {
    this.view.handleEvents(this.world.events);
    this.audio.handle(this.world.events, this.world.players[0]?.x ?? 0);
  }

  private onKey(e: KeyboardEvent): void {
    // A menu already handled it (see useHotkeys).
    if (e.repeat || e.defaultPrevented) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.inWave) this.setPaused(!this.paused);
    } else if (e.code === 'KeyM') {
      this.toggleMute();
    } else if (import.meta.env.DEV && e.code === 'KeyN' && this.inWave) {
      // Dev shortcut: skip to the end of the wave.
      this.world.waveTick = Math.max(this.world.waveTick, this.world.waveTicks - 1);
    }
  }

  private backdrop(): World {
    const world = createWorld({ seed: 0x5eed, zone: BACKDROP_ZONE });
    this.view.setWorld(world);
    this.view.hudVisible = false;
    return world;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
