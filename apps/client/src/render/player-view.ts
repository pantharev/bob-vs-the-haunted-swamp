import type { CharacterDef } from '@game/content';
import type { Player } from '@game/sim';
import { Container, Sprite } from 'pixi.js';
import type { Art } from './art';

/** Distance covered per footstep (wu); drives the hop rhythm. */
const STRIDE = 26;
/** Peak hop height at full speed (wu). */
const HOP_HEIGHT = 5;
/** Lean at full sideways speed (radians). */
const LEAN = 0.09;
/** How fast a direction change flips the sprite (1/s). */
const TURN_RATE = 26;
const FLASH_TIME = 0.12;
const FALL_TIME = 0.35;

/**
 * Brotato-style procedural animation on one static sprite: hop and squash
 * while walking, breathe while idle, lean into sideways movement, and
 * paper-flip on turns. No sprite-sheet frames needed (PLAN.md §6).
 *
 * The root sits at the player's feet; the source art faces right.
 */
export class PlayerView {
  readonly root = new Container();
  private readonly shadow: Sprite;
  private readonly shadowScale: number;
  private readonly body = new Container();
  private readonly flashSprite: Sprite;
  private walkPhase = 0;
  private time = 0;
  private facingScale = 1;
  private flash = 0;
  private fallen = 0;

  constructor(art: Art, def: CharacterDef) {
    this.shadow = new Sprite(art.shadow);
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.42;
    this.shadow.width = def.radius * 2.8;
    this.shadow.height = def.radius;
    this.shadowScale = this.shadow.scale.x;

    const bob = art.bob;
    const size = def.spriteHeight / bob.height;
    const sprite = new Sprite(bob.texture);
    this.flashSprite = new Sprite(bob.flash);
    for (const s of [sprite, this.flashSprite]) {
      s.anchor.set(bob.anchorX, bob.anchorY);
      s.scale.set(bob.scale * size);
    }
    this.flashSprite.alpha = 0;
    this.flashSprite.tint = 0xff5040;
    this.body.addChild(sprite, this.flashSprite);
    this.root.addChild(this.shadow, this.body);
  }

  hurt(): void {
    this.flash = FLASH_TIME;
  }

  update(p: Player, alpha: number, dt: number): void {
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const y = p.prevY + (p.y - p.prevY) * alpha;
    this.root.position.set(x, y);
    this.root.zIndex = y;
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.flashSprite.alpha = this.flash / FLASH_TIME;

    if (!p.alive) {
      // Topple over and fade a little.
      this.fallen = Math.min(FALL_TIME, this.fallen + dt);
      const t = this.fallen / FALL_TIME;
      this.body.rotation = (-Math.PI / 2) * p.facing * t * t;
      this.body.alpha = 1 - t * 0.35;
      this.body.position.y = 0;
      return;
    }
    this.fallen = 0;
    this.body.alpha = p.invulnerable > 0 && Math.floor(this.time * 18) % 2 === 0 ? 0.45 : 1;

    const speed = Math.min(1, Math.sqrt(p.vx * p.vx + p.vy * p.vy) / p.moveSpeed);
    // Advance by distance travelled so the feet never skate at low speed.
    this.walkPhase += (speed * p.moveSpeed * dt * Math.PI) / STRIDE;
    const hop = Math.abs(Math.sin(this.walkPhase)) * speed;
    const breathe = Math.sin(this.time * 2.4) * 0.014 * (1 - speed);

    this.facingScale += (p.facing - this.facingScale) * (1 - Math.exp(-TURN_RATE * dt));

    this.body.position.y = -hop * HOP_HEIGHT;
    this.body.scale.set(this.facingScale * (1 - hop * 0.04), 1 + hop * 0.06 + breathe);
    this.body.rotation = Math.max(-1, Math.min(1, p.vx / p.moveSpeed)) * LEAN;
    this.shadow.scale.x = this.shadowScale * (1 - hop * 0.18);
  }
}
