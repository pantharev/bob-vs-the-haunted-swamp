import { BitmapText, Container, Sprite, type Texture } from 'pixi.js';
import { SPLAT_FONT, type Art } from './art';

/** Projectiles and effects float at roughly chest height above the ground point. */
export const CHEST_HEIGHT = 30;

const MAX_PARTICLES = 320;
const MAX_SPLATS = 90;
const SPLAT_TIME = 0.8;
const SLASH_TIME = 0.14;
const EXPLOSION_TIME = 0.32;

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  /** Height above the ground and its velocity, for a little bounce. */
  z: number;
  vz: number;
  baseY: number;
  life: number;
  maxLife: number;
  size: number;
}

interface Timed {
  sprite: Sprite;
  life: number;
  maxLife: number;
  scale: number;
  spin: number;
}

interface Splat {
  root: Container;
  back: Sprite;
  text: BitmapText;
  life: number;
  scale: number;
}

export type SplatKind = 'damage' | 'crit' | 'miss';

/** Short-lived world-space effects. Everything is pooled; nothing allocates per hit. */
export class Fx {
  /** Under the darkness, with the world. */
  readonly world = new Container();
  /** Above the darkness, so damage numbers stay readable. */
  readonly overlay = new Container();
  private readonly particles: Particle[] = [];
  private readonly slashes: Timed[] = [];
  private readonly explosions: { ring: Timed; glow: Timed }[] = [];
  private readonly splats: Splat[] = [];

  constructor(private readonly art: Art) {}

  burst(x: number, y: number, tint: number, count: number, speed: number, size = 1): void {
    for (let i = 0; i < count; i++) {
      const p = this.particle();
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      p.sprite.tint = tint;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v * 0.5;
      p.z = 10 + Math.random() * 18;
      p.vz = 80 + Math.random() * 140;
      p.baseY = y;
      p.sprite.position.set(x, y);
      p.maxLife = p.life = 0.35 + Math.random() * 0.35;
      p.size = size * (0.6 + Math.random() * 0.7);
    }
  }

  slash(x: number, y: number, dirX: number, dirY: number, range: number, stab: boolean, tint: number): void {
    const s = this.timed(this.slashes, stab ? this.art.stab : this.art.slash, this.world);
    s.sprite.anchor.set(stab ? 0 : 0.5, 0.5);
    s.sprite.position.set(x + (stab ? 0 : dirX * range * 0.35), y - CHEST_HEIGHT + (stab ? 0 : dirY * range * 0.35));
    s.sprite.rotation = Math.atan2(dirY, dirX);
    s.scale = (range * (stab ? 1.1 : 1.3)) / (stab ? 50 : 100);
    s.spin = stab ? 0 : 1.6;
    s.sprite.tint = tint;
    s.maxLife = s.life = SLASH_TIME;
  }

  explosion(x: number, y: number, radius: number, tint: number): void {
    let e = this.explosions.find((ex) => ex.ring.life <= 0);
    if (!e) {
      e = {
        ring: this.newTimed(this.art.ring, this.world),
        glow: this.newTimed(this.art.glow, this.world),
      };
      this.explosions.push(e);
    }
    for (const t of [e.ring, e.glow]) {
      t.sprite.anchor.set(0.5);
      t.sprite.position.set(x, y - 6);
      t.sprite.tint = tint;
      t.maxLife = t.life = EXPLOSION_TIME;
      t.spin = 0;
      t.sprite.visible = true;
    }
    e.ring.scale = radius / 50;
    e.glow.scale = (radius * 2.2) / 128;
    this.burst(x, y, tint, 10, radius * 3, 1.4);
  }

  hitsplat(x: number, y: number, amount: number, kind: SplatKind): void {
    let s = this.splats.find((sp) => sp.life <= 0);
    if (!s) {
      if (this.splats.length >= MAX_SPLATS) return;
      const back = new Sprite(this.art.splat.red);
      back.anchor.set(0.5);
      const text = new BitmapText({ text: '', style: { fontFamily: SPLAT_FONT, fontSize: 17 } });
      text.anchor.set(0.5, 0.55);
      const root = new Container();
      root.addChild(back, text);
      this.overlay.addChild(root);
      s = { root, back, text, life: 0, scale: 1 };
      this.splats.push(s);
    }
    s.back.texture =
      kind === 'miss' ? this.art.splat.blue : kind === 'crit' ? this.art.splat.gold : this.art.splat.red;
    s.text.text = String(amount);
    s.root.position.set(x + (Math.random() - 0.5) * 18, y - (Math.random() * 10));
    s.scale = kind === 'crit' ? 1.3 : 1;
    s.life = SPLAT_TIME;
    s.root.visible = true;
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.vz -= 520 * dt;
      p.z = Math.max(0, p.z + p.vz * dt);
      if (p.z === 0) p.vz *= -0.35;
      p.baseY += p.vy * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y = p.baseY - p.z;
      p.vx *= 0.96;
      p.vy *= 0.96;
      const t = p.life / p.maxLife;
      p.sprite.alpha = Math.min(1, t * 2);
      p.sprite.scale.set(p.size * (0.5 + t * 0.5));
    }

    for (const s of this.slashes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const t = 1 - Math.max(0, s.life) / s.maxLife;
      s.sprite.visible = s.life > 0;
      s.sprite.alpha = 1 - t * t;
      s.sprite.scale.set(s.scale * (0.85 + t * 0.25), s.scale * (0.85 + t * 0.25));
      s.sprite.rotation += s.spin * dt;
    }

    for (const { ring, glow } of this.explosions) {
      if (ring.life <= 0) continue;
      ring.life -= dt;
      glow.life = ring.life;
      const t = 1 - Math.max(0, ring.life) / ring.maxLife;
      ring.sprite.visible = glow.sprite.visible = ring.life > 0;
      ring.sprite.scale.set(ring.scale * (0.3 + t * 0.8));
      ring.sprite.alpha = 1 - t;
      glow.sprite.scale.set(glow.scale * (0.6 + t * 0.5));
      glow.sprite.alpha = (1 - t) * 0.9;
    }

    for (const s of this.splats) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.root.visible = false;
        continue;
      }
      const age = SPLAT_TIME - s.life;
      const pop = age < 0.08 ? 1.35 - (age / 0.08) * 0.35 : 1;
      s.root.scale.set(s.scale * pop * 0.9);
      s.root.y -= 14 * dt;
      s.root.alpha = Math.min(1, s.life / 0.2);
    }
  }

  private particle(): Particle | null {
    let p = this.particles.find((q) => q.life <= 0);
    if (!p) {
      if (this.particles.length >= MAX_PARTICLES) return null;
      const sprite = new Sprite(this.art.dot);
      sprite.anchor.set(0.5);
      this.world.addChild(sprite);
      p = { sprite, vx: 0, vy: 0, z: 0, vz: 0, baseY: 0, life: 0, maxLife: 1, size: 1 };
      this.particles.push(p);
    }
    p.sprite.visible = true;
    p.sprite.alpha = 1;
    return p;
  }

  private timed(list: Timed[], texture: Texture, parent: Container): Timed {
    let t = list.find((s) => s.life <= 0);
    if (!t) {
      t = this.newTimed(texture, parent);
      list.push(t);
    }
    t.sprite.texture = texture;
    t.sprite.visible = true;
    t.sprite.alpha = 1;
    return t;
  }

  private newTimed(texture: Texture, parent: Container): Timed {
    const sprite = new Sprite(texture);
    sprite.visible = false;
    parent.addChild(sprite);
    return { sprite, life: 0, maxLife: 1, scale: 1, spin: 0 };
  }
}
