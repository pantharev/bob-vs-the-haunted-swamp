import { MAX_PARTY, WEAPON_IDS, ZONES, type WeaponId, type ZoneDef } from '@game/content';
import {
  applyFrame,
  hashDue,
  SHOP_FRAMES,
  startWorld,
  toSteps,
  type Frame,
  type RunStart,
} from '@game/coop';
import {
  applyAction,
  createWorld,
  DT,
  quantizeInput,
  ReplayRecorder,
  step,
  type InputCommand,
  type RunAction,
  type SimEvent,
  type World,
  worldHash,
} from '@game/sim';
import type { Application } from 'pixi.js';
import type { GameAudio } from './audio/audio';
import type { MusicScene } from './audio/music';
import type { UiSound } from './audio/sfx-bank';
import { Coop } from './coop/coop';
import { SEAT_COLORS, type Party } from './coop/party';
import type { DebugOverlay } from './debug/overlay';
import { HiscoreError, Hiscores } from './hiscores/client';
import type { SubmitResponse } from './hiscores/protocol';
import type { Input } from './input/input';
import { typingIn } from './input/keyboard';
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
  /** Debug: a fixed seed. The run can't be ranked. */
  seed?: number;
  /** Debug: start at a later wave. The run can't be ranked. */
  wave?: number;
}

/** Plays local teammates (`?bots=N`, co-op testing before the server exists). */
export interface BotBrain {
  botInput(world: World, player: World['players'][number]): InputCommand;
  /** Spends one bot's intermission: picks, shopping, then ready. */
  botIntermission(world: World, index: number): void;
}

/** What the title screen shows for co-op before you're in a room. */
export type CoopEntry =
  { readonly mode: 'create' } | { readonly mode: 'join'; readonly code: string };

/** A co-op run in progress: frames from the server waiting to be played, and how many were. */
interface NetRun {
  readonly queue: Frame[];
  applied: number;
  /** Frame the current intermission opened at, for the shop timer. */
  intermissionSince: number | null;
}

/** Frames kept in hand against network jitter; more than this means we're behind and catch up. */
const NET_BUFFER = 6;
/** Most frames played in one render frame while catching up (after a hidden tab, say). */
const NET_CATCH_UP = 120;

/** A run that can go on the hiscores: its ticket, and the replay being recorded. */
interface RankedRun {
  readonly ticket: string;
  readonly recorder: ReplayRecorder;
  posted: SubmitResponse | null;
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
  readonly hiscores = new Hiscores();
  /** Co-op, once opened from the title screen or an invite link. */
  coop: Coop | null = null;
  coopEntry: CoopEntry | null = null;
  /** Which of the world's players is you: 0 except in co-op. */
  localPlayer = 0;
  /** Names and colours of a multi-player run (co-op or ?bots); null when solo. */
  party: Party | null = null;
  private ranked: RankedRun | null = null;
  private net: NetRun | null = null;
  private bots: { readonly count: number; readonly brain: BotBrain } | null = null;
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
    this.hiscores.prefetch();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get inWave(): boolean {
    return this.screen === 'run' && this.world.phase === 'wave';
  }

  /** In a co-op run (or its results). */
  get isCoop(): boolean {
    return this.net !== null;
  }

  /** Shows co-op on the title screen: creating a game, or joining one from an invite link. */
  openCoop(entry: CoopEntry): void {
    this.coop ??= new Coop(this);
    this.coopEntry = entry;
    this.notify();
  }

  /** Back from the co-op screens to the normal title (not in a room). */
  closeCoop(): void {
    this.coopEntry = null;
    this.audio.ui('click');
    this.notify();
  }

  /** The server started (or rebuilt) a run: play it from its frames as player `me`. */
  startCoop(start: RunStart, me: number): void {
    const fresh = start.frames.length === 0;
    this.ranked = null;
    this.localPlayer = me;
    this.party = {
      names: start.roster.map((r) => r.name),
      colors: start.roster.map((r) => SEAT_COLORS[r.seat % SEAT_COLORS.length]!),
      me,
    };
    this.world = startWorld(start);
    this.net = { queue: [], applied: 0, intermissionSince: null };
    // A rejoin or resync catches up silently on the frames already played.
    for (const frame of start.frames) this.playFrame(frame, false);
    this.view.focus = me;
    this.view.setWorld(this.world);
    this.view.setParty(this.party);
    this.view.hudVisible = true;
    this.screen = 'run';
    this.paused = false;
    this.accumulator = 0;
    this.input.reset();
    if (fresh) this.audio.ui('start');
    this.notify();
  }

  /** Frames from the server, in order. */
  pushFrames(from: number, frames: readonly Frame[]): void {
    const net = this.net;
    if (!net) return;
    const expected = net.applied + net.queue.length;
    // Anything before `expected` we already have (it came with a resync).
    if (from + frames.length <= expected || from > expected) return;
    net.queue.push(...frames.slice(expected - from));
  }

  /** Seconds left before the server readies anyone still shopping, in co-op. */
  get shopSecondsLeft(): number | null {
    const net = this.net;
    if (!net || net.intermissionSince === null) return null;
    return Math.max(0, Math.ceil((net.intermissionSince + SHOP_FRAMES - net.applied) / 60));
  }

  /** From co-op results back to the room's lobby. */
  backToLobby(): void {
    this.endCoopRun();
    this.audio.ui('click');
    this.notify();
  }

  /** Left the room (or it closed): back to the plain title screen. */
  leaveCoop(): void {
    this.endCoopRun();
    this.coopEntry = null;
    this.notify();
  }

  private endCoopRun(): void {
    this.net = null;
    this.party = null;
    this.localPlayer = 0;
    this.view.focus = 0;
    this.world = this.backdrop();
    this.screen = 'title';
    this.paused = false;
  }

  /** Every following run gets `count` bot teammates. Such runs aren't ranked. */
  useBots(count: number, brain: BotBrain): void {
    this.bots = { count: Math.max(0, Math.min(count, MAX_PARTY - 1)), brain };
  }

  startRun({ weapon, seed, wave }: RunOptions): void {
    this.lastWeapon = weapon;
    this.net = null;
    this.localPlayer = 0;
    this.view.focus = 0;
    const bots = this.bots?.count ?? 0;
    // Only a normal solo start can be ranked: the server picks the seed and the run starts at wave 1.
    const ticket =
      seed === undefined && wave === undefined && bots === 0 ? this.hiscores.take() : null;
    const runSeed = ticket?.seed ?? seed ?? Date.now() >>> 0;
    this.ranked = ticket
      ? { ticket: ticket.ticket, recorder: new ReplayRecorder(runSeed, weapon), posted: null }
      : null;
    this.world = createWorld({
      seed: runSeed,
      zone: ZONES.wolfmoor,
      // Bots take the next weapons in the list, so a party shows a mix.
      loadouts: Array.from({ length: 1 + bots }, (_, i) => [
        i === 0 ? weapon : WEAPON_IDS[(WEAPON_IDS.indexOf(weapon) + i) % WEAPON_IDS.length]!,
      ]),
      startWave: wave,
    });
    this.view.setWorld(this.world);
    this.party = bots
      ? {
          names: ['You', ...Array.from({ length: bots }, (_, i) => `Bot ${i + 1}`)],
          colors: Array.from({ length: 1 + bots }, (_, i) => SEAT_COLORS[i % SEAT_COLORS.length]!),
          me: 0,
        }
      : null;
    this.view.setParty(this.party);
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
    if (this.coop?.lobby) {
      this.audio.ui('click');
      this.coop.leave();
      return;
    }
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

  /** Whether the finished (or current) run can be posted to the hiscores. */
  get rankable(): boolean {
    return this.ranked !== null;
  }

  /** The hiscores' answer if this run was posted. */
  get posted(): SubmitResponse | null {
    return this.ranked?.posted ?? null;
  }

  /** Posts the finished run. The server re-runs the replay and answers with its own score and ranks. */
  async postScore(name: string): Promise<SubmitResponse> {
    const ranked = this.ranked;
    if (!ranked || this.world.phase !== 'over') throw new HiscoreError("This run can't be posted.");
    ranked.posted = await this.hiscores.submit({
      ticket: ranked.ticket,
      name,
      rules: __RULES__,
      score: this.world.stats.score,
      replay: ranked.recorder.finish(),
    });
    this.notify();
    return ranked.posted;
  }

  /** A between-wave choice from the UI. Returns false if the sim refused it. */
  act(action: RunAction): boolean {
    const sound = this.actionSound(action);
    if (this.net) {
      // Co-op: the server applies it, and it comes back in a frame for everyone.
      this.coop?.sendAction(action);
      this.audio.ui(sound);
      return true;
    }
    const ok = applyAction(this.world, this.localPlayer, action);
    if (ok) this.ranked?.recorder.action(action);
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
    this.botsShop(world);
    if (this.net) {
      this.netFrame(frameSeconds);
      this.view.render(Math.min(1, this.accumulator / DT), frameSeconds, this.input);
      this.audio.update(this.musicScene(), this.musicIntensity(), false);
      this.debugLines(world, fps);
      return;
    }
    const running = this.inWave && !this.paused;

    if (running) {
      this.accumulator += frameSeconds;
      const simStart = performance.now();
      let steps = 0;
      while (this.accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
        // Quantized so a replay of this run steps with exactly the same numbers.
        const command = quantizeInput(this.input.sample());
        this.ranked?.recorder.input(command);
        step(world, [command, ...this.botInputs(world)]);
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
    this.debugLines(world, fps);
  }

  /**
   * Co-op: plays the server's frames at 60 a second, keeping a few in hand
   * against jitter and catching up when behind. Sends your input as it goes.
   */
  private netFrame(frameSeconds: number): void {
    const net = this.net!;
    const [x, y] = this.paused ? [0, 0] : toSteps(this.input.sample());
    this.coop?.sendInput(x, y, performance.now());

    const simStart = performance.now();
    this.accumulator += frameSeconds;
    const extra = Math.max(0, net.queue.length - NET_BUFFER);
    let steps = 0;
    while (
      net.queue.length > 0 &&
      steps < NET_CATCH_UP &&
      (this.accumulator >= DT || steps < extra)
    ) {
      this.playFrame(net.queue.shift()!, true);
      if (this.accumulator >= DT) this.accumulator -= DT;
      steps++;
    }
    // Out of frames: wait for the next bundle instead of running up a debt.
    if (net.queue.length === 0) this.accumulator = Math.min(this.accumulator, DT);
    this.debug.recordSim(performance.now() - simStart, steps);
  }

  /** Applies one server frame; `live` frames also drive the view, sound and hash reports. */
  private playFrame(frame: Frame, live: boolean): void {
    const net = this.net!;
    const world = this.world;
    const phase = world.phase;
    applyFrame(world, frame, live ? (events) => this.consume(events) : undefined);
    const index = net.applied++;
    if (live && hashDue(index)) this.coop?.sendHash(index, worldHash(world));
    if (world.phase === 'intermission') net.intermissionSince ??= index;
    else net.intermissionSince = null;
    if (live && (world.phase !== phase || frame.a)) {
      this.input.reset();
      this.notify();
    }
  }

  private debugLines(world: World, fps: number): void {
    this.debug.update(performance.now(), () => {
      const p = world.players[this.localPlayer];
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
    // The co-op lobby gets the shop's music box.
    if (this.screen === 'title' && this.coop?.lobby) return 'shop';
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
    const p = this.world.players[this.localPlayer];
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

  private botInputs(world: World): InputCommand[] {
    const brain = this.bots?.brain;
    if (!brain) return [];
    return world.players.slice(1).map((p) => quantizeInput(brain.botInput(world, p)));
  }

  /** Bots shop the moment an intermission opens; the last one to be ready may start the wave. */
  private botsShop(world: World): void {
    const brain = this.bots?.brain;
    if (!brain || this.screen !== 'run' || world.phase !== 'intermission') return;
    for (let i = 1; i < world.players.length; i++) brain.botIntermission(world, i);
    // Re-read: the bots' Ready may have started the wave.
    if (this.inWave) {
      this.accumulator = 0;
      this.input.reset();
      this.consume();
      this.notify();
    }
  }

  private consume(events: readonly SimEvent[] = this.world.events): void {
    this.view.handleEvents(events);
    this.audio.handle(events, this.world.players[this.localPlayer]?.x ?? 0, this.localPlayer);
  }

  private onKey(e: KeyboardEvent): void {
    // A menu already handled it (see useHotkeys).
    if (e.repeat || e.defaultPrevented || typingIn(e)) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      // In co-op this only opens the menu: the game keeps going.
      if (this.inWave) this.setPaused(!this.paused);
    } else if (e.code === 'KeyM') {
      this.toggleMute();
    } else if (import.meta.env.DEV && e.code === 'KeyN' && this.inWave && !this.net) {
      // Dev shortcut: skip to the end of the wave. That isn't in the replay, so the run is unranked.
      this.world.waveTick = Math.max(this.world.waveTick, this.world.waveTicks - 1);
      this.ranked = null;
    }
  }

  private backdrop(): World {
    const world = createWorld({ seed: 0x5eed, zone: BACKDROP_ZONE });
    this.view.setWorld(world);
    this.view.hudVisible = false;
    return world;
  }

  notify(): void {
    for (const listener of this.listeners) listener();
  }
}
