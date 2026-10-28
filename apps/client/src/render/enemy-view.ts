import type { Enemy } from '@game/sim';
import { Container, Sprite, Texture } from 'pixi.js';
import type { Art, Baked, EnemyLook } from './art';

/** Collision radius each look's art is drawn for; bigger enemies scale up from it. */
const LOOK_RADIUS: Readonly<Record<EnemyLook, number>> = {
  zombie: 15,
  hand: 9,
  slime: 20,
  werewolf: 17,
  wolf: 17,
};
const FLASH_TIME = 0.1;
const SPAWN_TIME = 0.18;
const DEATH_TIME = 0.16;
/** HP bars stay up this long after the last hit (s). */
const BAR_TIME = 2.5;
const BAR_HEIGHT = 5;
const TURN_RATE = 18;
const ELITE_TINT = 0xff9c8c;
const TELEGRAPH_TINT = 0xff3020;

/**
 * One enemy on screen. Like PlayerView it animates a single static sprite
 * procedurally (hop, squash, scuttle), plus hit flash, a classic green/red
 * HP bar and a short death pop. Views are pooled and re-assigned.
 */
export class EnemyView {
  readonly root = new Container();
  /** Lives in a layer above the darkness, so bars stay readable. */
  readonly bar = new Container();
  id = 0;
  /** Set once the enemy is gone; the view plays its death pop, then is released. */
  dying = false;
  private readonly shadow: Sprite;
  private readonly body = new Container();
  private readonly sprite = new Sprite();
  private readonly flashSprite = new Sprite();
  private readonly barBack = new Sprite(Texture.WHITE);
  private readonly barFill = new Sprite(Texture.WHITE);
  private look: EnemyLook = 'zombie';
  private baked: Baked;
  private size = 1;
  private elite = false;
  private time = 0;
  private walkPhase = 0;
  private facing = 1;
  private flash = 0;
  private spawn = 0;
  private death = 0;
  private barTimer = 0;
  private seed = 0;

  constructor(private readonly art: Art) {
    this.shadow = new Sprite(art.shadow);
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.42;
    this.body.addChild(this.sprite, this.flashSprite);
    this.root.addChild(this.shadow, this.body);
    this.barBack.tint = 0xc0170f;
    this.barFill.tint = 0x2fd12f;
    this.bar.addChild(this.barBack, this.barFill);
    this.baked = art.enemies.zombie;
  }

  assign(e: Enemy): void {
    this.id = e.id;
    this.dying = false;
    this.elite = e.elite;
    this.time = 0;
    this.walkPhase = 0;
    this.flash = 0;
    this.spawn = 0;
    this.death = 0;
    this.barTimer = e.elite ? Infinity : 0;
    this.seed = (e.id * 0.618) % 1;
    this.facing = e.vx < 0 ? -1 : 1;
    this.root.alpha = 1;
    this.root.visible = true;
    this.bar.visible = false;
    this.setLook(lookOf(e), e.radius);
  }

  hit(): void {
    this.flash = FLASH_TIME;
    if (this.barTimer !== Infinity) this.barTimer = BAR_TIME;
  }

  die(): void {
    this.dying = true;
    this.death = 0;
    this.flash = FLASH_TIME;
    this.bar.visible = false;
  }

  /** Advances the death pop; returns false once it has finished. */
  updateDying(dt: number): boolean {
    this.death += dt;
    const t = Math.min(1, this.death / DEATH_TIME);
    this.body.scale.set(this.facing * this.size * (1 + t * 0.35), this.size * (1 - t * 0.7));
    this.flashSprite.alpha = 1 - t;
    this.root.alpha = 1 - t * t;
    return t < 1;
  }

  update(e: Enemy, alpha: number, dt: number): void {
    const look = lookOf(e);
    if (look !== this.look) this.setLook(look, e.radius);

    const x = e.prevX + (e.x - e.prevX) * alpha;
    const y = e.prevY + (e.y - e.prevY) * alpha;
    this.root.position.set(x, y);
    this.root.zIndex = y;
    this.time += dt;
    this.spawn = Math.min(SPAWN_TIME, this.spawn + dt);
    this.flash = Math.max(0, this.flash - dt);

    const speed = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    const want = e.action === 'walk' ? (Math.abs(e.vx) > 4 ? Math.sign(e.vx) : this.facing) : Math.sign(e.dirX) || 1;
    this.facing += (want - this.facing) * (1 - Math.exp(-TURN_RATE * dt));

    let hop: number;
    let sx = 1;
    let sy = 1;
    let rotation = 0;
    let shakeX = 0;
    switch (look) {
      case 'hand': {
        this.walkPhase += (speed * dt * Math.PI) / 9;
        hop = Math.abs(Math.sin(this.walkPhase)) * 2;
        rotation = Math.sin(this.walkPhase * 0.5) * 0.12;
        break;
      }
      case 'slime': {
        const wobble = Math.sin(this.time * 6 + this.seed * 6.28);
        this.walkPhase += (speed * dt * Math.PI) / 30;
        hop = Math.abs(Math.sin(this.walkPhase)) * 4;
        sy = 1 + wobble * 0.07 + hop * 0.03;
        sx = 1 - wobble * 0.06 - hop * 0.02;
        break;
      }
      default: {
        const stride = look === 'wolf' ? 34 : 28;
        this.walkPhase += (speed * dt * Math.PI) / stride;
        const step = Math.abs(Math.sin(this.walkPhase)) * Math.min(1, speed / 60);
        hop = step * (look === 'wolf' ? 5 : 3);
        sx = 1 - step * 0.04;
        sy = 1 + step * 0.05;
        rotation = Math.max(-1, Math.min(1, e.vx / 120)) * 0.08;
      }
    }

    let tint = this.elite ? ELITE_TINT : 0xffffff;
    if (e.action === 'telegraph') {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 40);
      tint = pulse > 0.5 ? TELEGRAPH_TINT : 0xffb0a0;
      shakeX = Math.sin(this.time * 90) * 2;
      sy *= 0.9;
      sx *= 1.06;
    } else if (e.action === 'lunge') {
      sx *= 1.2;
      sy *= 0.86;
      rotation = 0.25 * Math.sign(e.dirX || 1);
    }

    const pop = 0.4 + 0.6 * easeOutBack(this.spawn / SPAWN_TIME);
    const flashPop = 1 + (this.flash / FLASH_TIME) * 0.12;
    this.body.position.set(shakeX, -hop);
    this.body.scale.set(this.facing * sx * this.size * pop * flashPop, sy * this.size * pop * flashPop);
    this.body.rotation = rotation;
    this.sprite.tint = tint;
    this.flashSprite.alpha = this.flash / FLASH_TIME;
    this.shadow.scale.set(((e.radius * 2.6) / this.shadow.texture.width) * (1 - hop * 0.03));
    this.shadow.height = e.radius * 0.9;

    this.updateBar(e, x, y, dt);
  }

  private updateBar(e: Enemy, x: number, y: number, dt: number): void {
    this.barTimer -= dt;
    const show = e.hp < e.maxHp && this.barTimer > 0;
    this.bar.visible = show;
    if (!show) return;
    const width = Math.max(26, e.radius * 2.2);
    const top = y - this.baked.height * this.size - 8;
    this.bar.position.set(x - width / 2, top);
    this.barBack.width = width;
    this.barBack.height = BAR_HEIGHT;
    this.barFill.width = width * Math.max(0, e.hp / e.maxHp);
    this.barFill.height = BAR_HEIGHT;
  }

  private setLook(look: EnemyLook, radius: number): void {
    this.look = look;
    this.baked = this.art.enemies[look];
    this.size = radius / LOOK_RADIUS[look];
    for (const s of [this.sprite, this.flashSprite]) {
      s.anchor.set(this.baked.anchorX, this.baked.anchorY);
      s.scale.set(this.baked.scale);
    }
    this.sprite.texture = this.baked.texture;
    this.flashSprite.texture = this.baked.flash;
  }
}

function lookOf(e: Enemy): EnemyLook {
  switch (e.def.id) {
    case 'slimeMedium':
    case 'slimeSmall':
      return 'slime';
    case 'werewolf':
      return e.transformed ? 'wolf' : 'werewolf';
    default:
      return e.def.id;
  }
}

function easeOutBack(t: number): number {
  const c = 1.70158;
  const u = Math.min(1, t) - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}
