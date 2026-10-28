import { WEAPONS, type EnemyId, type WeaponId } from '@game/content';
import type { SimEvent, World } from '@game/sim';
import { Container, Sprite, type Application, type Texture } from 'pixi.js';
import type { Input } from '../input/input';
import type { Art } from './art';
import { createArenaView } from './arena-view';
import { Atmosphere } from './atmosphere';
import { Camera } from './camera';
import { EnemyView } from './enemy-view';
import { CHEST_HEIGHT, Fx } from './fx';
import { Hud } from './hud';
import { JoystickView } from './joystick-view';
import { PlayerView } from './player-view';

/** Particle colour per enemy kind, for death bursts. */
const GORE: Readonly<Record<EnemyId, number>> = {
  zombie: 0x7d9a55,
  hand: 0xd8cfb0,
  slime: 0x76c043,
  slimeMedium: 0x76c043,
  slimeSmall: 0x76c043,
  werewolf: 0x8a5a3a,
};
const SLASH_TINT: Partial<Record<WeaponId, number>> = { scimitar: 0xdfe8f0, dagger: 0xffffff };
const EXPLOSION_TINT: Partial<Record<WeaponId, number>> = { staff: 0x7fd0ff, boomchin: 0xffa040 };
/** Peak height of a lobbed throw (wu). */
const LOB_HEIGHT = 70;

/**
 * Draws the sim. Reads world state only, never writes it, so the same
 * renderer later works for replays and network snapshots.
 */
export class GameView {
  readonly camera = new Camera();
  /** Off on the title screen, where the backdrop world isn't a real run. */
  hudVisible = true;
  private readonly worldLayer = new Container();
  private readonly groundFx = new Container();
  private readonly entityLayer = new Container({ sortableChildren: true });
  private readonly airLayer = new Container();
  /** Same transform as the world, but drawn above the darkness. */
  private readonly overlayWorld = new Container();
  private readonly barsLayer = new Container();
  private readonly fx: Fx;
  private readonly hud: Hud;
  private readonly joystickView = new JoystickView();
  private readonly gooSprites: Sprite[] = [];
  private readonly markerSprites: Sprite[] = [];
  private readonly pickupSprites: Sprite[] = [];
  private readonly projectileSprites: Sprite[] = [];
  private readonly enemyViews = new Map<number, EnemyView>();
  private readonly enemyPool: EnemyView[] = [];
  private readonly seenThisFrame = new Set<number>();
  private world: World | null = null;
  private arena: Container | null = null;
  private atmosphere: Atmosphere | null = null;
  private players: PlayerView[] = [];
  private time = 0;

  constructor(
    private readonly app: Application,
    private readonly art: Art,
  ) {
    this.fx = new Fx(art);
    this.hud = new Hud(art);
    this.worldLayer.addChild(this.groundFx, this.entityLayer, this.airLayer, this.fx.world);
    this.overlayWorld.addChild(this.barsLayer, this.fx.overlay);
    app.stage.addChild(this.worldLayer, this.overlayWorld, this.hud.root, this.joystickView.root);
  }

  /** Points the view at a new run: rebuilds the seed-dependent arena and mood. */
  setWorld(world: World): void {
    this.world = world;
    this.arena?.destroy({ children: true, texture: true, textureSource: true });
    this.atmosphere?.root.destroy({ children: true, texture: true, textureSource: true });

    this.arena = createArenaView(world.arena, world.seed);
    this.worldLayer.addChildAt(this.arena, 0);
    this.atmosphere = new Atmosphere(world.seed);
    this.app.stage.addChildAt(this.atmosphere.root, this.app.stage.getChildIndex(this.worldLayer) + 1);

    for (const view of this.players) view.root.destroy({ children: true });
    this.players = world.players.map((p) => {
      const view = new PlayerView(this.art, p.character);
      this.entityLayer.addChild(view.root);
      return view;
    });
    for (const view of this.enemyViews.values()) this.releaseEnemy(view);
    this.enemyViews.clear();

    const focus = world.players[0];
    if (focus) this.camera.snapTo(focus.x, focus.y);
  }

  handleEvents(events: readonly SimEvent[]): void {
    const world = this.world;
    if (!world) return;
    for (const ev of events) {
      switch (ev.type) {
        case 'enemyHit':
          this.enemyViews.get(ev.id)?.hit();
          this.fx.hitsplat(ev.x, ev.y - CHEST_HEIGHT, ev.amount, ev.crit ? 'crit' : 'damage');
          break;
        case 'enemyDeath': {
          const view = this.enemyViews.get(ev.id);
          if (view && !view.dying) view.die();
          if (ev.cleared) {
            this.fx.burst(ev.x, ev.y, 0x9aa3a0, 4, 60, 1.2);
          } else {
            this.fx.burst(ev.x, ev.y, GORE[ev.enemy], ev.elite ? 26 : 7, ev.elite ? 260 : 150);
            if (ev.elite) this.camera.shake(0.45);
          }
          break;
        }
        case 'transform': {
          const e = world.enemies.find((x) => x.id === ev.id);
          if (e) this.fx.burst(e.x, e.y - 30, 0x5e5247, 14, 180, 1.3);
          this.camera.shake(0.12);
          break;
        }
        case 'playerHit': {
          const p = world.players[ev.player];
          if (!p) break;
          this.fx.hitsplat(p.x, p.y - CHEST_HEIGHT - 12, ev.amount, ev.dodged ? 'miss' : 'damage');
          if (!ev.dodged) {
            this.players[ev.player]?.hurt();
            this.camera.shake(0.28 + Math.min(0.3, ev.amount / p.maxHp));
          }
          break;
        }
        case 'playerDeath':
          this.camera.shake(0.7);
          break;
        case 'attack': {
          const def = WEAPONS[ev.weapon];
          if (def.pattern === 'arc') {
            this.fx.slash(ev.x, ev.y, ev.dirX, ev.dirY, def.range, ev.weapon === 'dagger', SLASH_TINT[ev.weapon] ?? 0xffffff);
          }
          break;
        }
        case 'explosion':
          this.fx.explosion(ev.x, ev.y, ev.radius, EXPLOSION_TINT[ev.weapon] ?? 0xffffff);
          if (ev.weapon === 'boomchin') this.camera.shake(0.12);
          break;
        case 'pickup': {
          const p = world.players[ev.player];
          if (p) this.fx.burst(p.x, p.y - 20, ev.kind === 'coin' ? 0xffd75a : 0x7be36a, ev.kind === 'coin' ? 2 : 10, 70, 0.7);
          break;
        }
        case 'levelUp': {
          const p = world.players[ev.player];
          if (p) this.fx.burst(p.x, p.y - 30, 0x8fd8ff, 22, 220, 1.2);
          break;
        }
      }
    }
  }

  /** `alpha` is how far (0..1) we are between the last two sim ticks. */
  render(alpha: number, dt: number, input: Input): void {
    const world = this.world;
    if (!world) return;
    const { width, height } = this.app.screen;
    this.time += dt;

    world.players.forEach((player, i) => this.players[i]?.update(player, alpha, dt));
    this.syncEnemies(world, alpha, dt);
    this.syncGoo(world);
    this.syncMarkers(world);
    this.syncPickups(world, alpha);
    this.syncProjectiles(world, alpha);
    this.fx.update(dt);

    const focus = world.players[0];
    if (!focus) return;
    const fx = focus.prevX + (focus.x - focus.prevX) * alpha;
    const fy = focus.prevY + (focus.y - focus.prevY) * alpha;

    const cam = this.camera;
    cam.update(fx, fy, width, height, dt, world.arena);
    for (const layer of [this.worldLayer, this.overlayWorld]) {
      layer.scale.set(cam.scale);
      layer.position.set(
        width / 2 - (cam.x + cam.shakeX) * cam.scale,
        height / 2 - (cam.y + cam.shakeY) * cam.scale,
      );
    }

    const lanterns = focus.items['lantern'] ?? 0;
    this.atmosphere?.update(cam, fx, fy, width, height, dt, 1 + lanterns * 0.15);
    this.hud.root.visible = this.hudVisible && world.phase === 'wave';
    if (this.hud.root.visible) this.hud.update(world, focus, width, height);
    this.joystickView.update(input.joystick);
  }

  private syncEnemies(world: World, alpha: number, dt: number): void {
    const seen = this.seenThisFrame;
    seen.clear();
    for (const e of world.enemies) {
      let view = this.enemyViews.get(e.id);
      if (!view) {
        view = this.enemyPool.pop() ?? this.newEnemyView();
        view.assign(e);
        this.enemyViews.set(e.id, view);
      }
      seen.add(e.id);
      view.update(e, alpha, dt);
    }
    for (const [id, view] of this.enemyViews) {
      if (seen.has(id)) continue;
      if (!view.dying) view.die();
      if (!view.updateDying(dt)) {
        this.enemyViews.delete(id);
        this.releaseEnemy(view);
      }
    }
  }

  private newEnemyView(): EnemyView {
    const view = new EnemyView(this.art);
    this.entityLayer.addChild(view.root);
    this.barsLayer.addChild(view.bar);
    return view;
  }

  private releaseEnemy(view: EnemyView): void {
    view.root.visible = false;
    view.bar.visible = false;
    this.enemyPool.push(view);
  }

  private syncGoo(world: World): void {
    const sprites = this.pool(this.gooSprites, world.goo.length, this.art.goo, this.groundFx, 0);
    world.goo.forEach((g, i) => {
      const s = sprites[i]!;
      s.position.set(g.x, g.y);
      s.width = g.radius * 2.4;
      s.height = g.radius * 1.4;
      s.alpha = Math.min(1, g.ticks / 30) * 0.8;
    });
  }

  private syncMarkers(world: World): void {
    const sprites = this.pool(this.markerSprites, world.markers.length, this.art.marker, this.groundFx);
    world.markers.forEach((m, i) => {
      const s = sprites[i]!;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 14 + m.id);
      s.position.set(m.x, m.y);
      s.alpha = 0.45 + pulse * 0.55;
      s.scale.set((m.elite ? 1.7 : m.count > 1 ? 1.3 : 1) * (0.9 + pulse * 0.15));
    });
  }

  private syncPickups(world: World, alpha: number): void {
    const sprites = this.pool(this.pickupSprites, world.pickups.length, this.art.coin, this.groundFx);
    world.pickups.forEach((pk, i) => {
      const s = sprites[i]!;
      s.texture = pk.kind === 'coin' ? this.art.coin : this.art.food;
      const x = pk.prevX + (pk.x - pk.prevX) * alpha;
      const y = pk.prevY + (pk.y - pk.prevY) * alpha;
      const bob = pk.target < 0 ? Math.sin(this.time * 5 + pk.id) * 2 : 0;
      s.position.set(x, y - 6 + bob);
      s.scale.set(pk.kind === 'coin' ? Math.min(1.6, 0.9 + pk.value * 0.12) : 1.2);
    });
  }

  private syncProjectiles(world: World, alpha: number): void {
    const sprites = this.pool(this.projectileSprites, world.projectiles.length, this.art.dot, this.airLayer);
    world.projectiles.forEach((pr, i) => {
      const s = sprites[i]!;
      s.texture = this.art.projectiles[pr.weapon] ?? this.art.dot;
      const x = pr.prevX + (pr.x - pr.prevX) * alpha;
      const y = pr.prevY + (pr.y - pr.prevY) * alpha;
      if (pr.lob) {
        const t = Math.min(1, (pr.age + alpha) / pr.flight);
        s.position.set(x, y - 10 - 4 * LOB_HEIGHT * t * (1 - t));
        s.rotation = t * 9;
        s.scale.set(1.1);
        s.blendMode = 'normal';
      } else {
        s.position.set(x, y - CHEST_HEIGHT);
        s.rotation = Math.atan2(pr.vy, pr.vx);
        const glow = pr.weapon === 'staff';
        s.scale.set(glow ? 0.75 : 1.1);
        s.blendMode = glow ? 'add' : 'normal';
      }
    });
  }

  /** Grows a sprite pool to `count`, shows the first `count` and hides the rest. */
  private pool(sprites: Sprite[], count: number, texture: Texture, parent: Container, at?: number): Sprite[] {
    while (sprites.length < count) {
      const s = new Sprite(texture);
      s.anchor.set(0.5);
      if (at === undefined) parent.addChild(s);
      else parent.addChildAt(s, Math.min(at, parent.children.length));
      sprites.push(s);
    }
    for (let i = 0; i < sprites.length; i++) sprites[i]!.visible = i < count;
    return sprites;
  }
}
