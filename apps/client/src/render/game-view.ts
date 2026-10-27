import { BOB } from '@game/content';
import type { World } from '@game/sim';
import { Assets, Container, type Application, type Texture } from 'pixi.js';
import type { Input } from '../input/input';
import { createArenaView } from './arena-view';
import { Atmosphere } from './atmosphere';
import { Camera } from './camera';
import { JoystickView } from './joystick-view';
import { PlayerView } from './player-view';

const BOB_SPRITE_URL = `${import.meta.env.BASE_URL}sprites/bob.png`;

/**
 * Draws the sim. Reads world state only, never writes it, so the same
 * renderer later works for replays and network snapshots.
 */
export class GameView {
  readonly camera = new Camera();
  private readonly worldLayer = new Container();
  private readonly entityLayer = new Container({ sortableChildren: true });
  private readonly atmosphere: Atmosphere;
  private readonly joystickView = new JoystickView();
  private readonly players: PlayerView[] = [];

  constructor(
    private readonly app: Application,
    private readonly world: World,
  ) {
    this.atmosphere = new Atmosphere(world.seed);
  }

  async load(): Promise<void> {
    const bobTexture = await loadOptionalTexture(BOB_SPRITE_URL);
    for (let i = 0; i < this.world.players.length; i++) {
      const view = new PlayerView(bobTexture, BOB);
      this.players.push(view);
      this.entityLayer.addChild(view.root);
    }

    this.worldLayer.addChild(createArenaView(this.world.arena, this.world.seed), this.entityLayer);
    this.app.stage.addChild(this.worldLayer, this.atmosphere.root, this.joystickView.root);

    const focus = this.world.players[0];
    if (focus) this.camera.snapTo(focus.x, focus.y);
  }

  /** `alpha` is how far (0..1) we are between the last two sim ticks. */
  render(alpha: number, dt: number, input: Input): void {
    const { width, height } = this.app.screen;

    this.world.players.forEach((player, i) => this.players[i]?.update(player, alpha, dt));

    const focus = this.world.players[0];
    if (!focus) return;
    const fx = focus.prevX + (focus.x - focus.prevX) * alpha;
    const fy = focus.prevY + (focus.y - focus.prevY) * alpha;

    const cam = this.camera;
    cam.update(fx, fy, width, height, dt, this.world.arena);
    this.worldLayer.scale.set(cam.scale);
    this.worldLayer.position.set(width / 2 - cam.x * cam.scale, height / 2 - cam.y * cam.scale);

    this.atmosphere.update(cam, fx, fy, width, height, dt);
    this.joystickView.update(input.joystick);
  }
}

/** Loads a texture if the file exists; the game falls back to placeholder art otherwise. */
async function loadOptionalTexture(url: string): Promise<Texture | null> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok || !head.headers.get('content-type')?.startsWith('image/')) return null;
    return await Assets.load<Texture>(url);
  } catch {
    return null;
  }
}
