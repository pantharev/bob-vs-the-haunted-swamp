import type { CharacterDef } from '@game/content';
import type { Player } from '@game/sim';
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';

/** Distance covered per footstep (wu); drives the hop rhythm. */
const STRIDE = 26;
/** Peak hop height at full speed (wu). */
const HOP_HEIGHT = 5;
/** Lean at full sideways speed (radians). */
const LEAN = 0.09;
/** How fast a direction change flips the sprite (1/s). */
const TURN_RATE = 26;

/**
 * Brotato-style procedural animation on one static sprite: hop and squash
 * while walking, breathe while idle, lean into sideways movement, and
 * paper-flip on turns. No sprite-sheet frames needed (PLAN.md §6).
 *
 * The root sits at the player's feet; the source art faces right.
 */
export class PlayerView {
  readonly root = new Container();
  private readonly shadow = new Graphics();
  private readonly body = new Container();
  private walkPhase = 0;
  private time = 0;
  private facingScale = 1;

  constructor(texture: Texture | null, def: CharacterDef) {
    this.shadow.ellipse(0, 0, def.radius * 1.4, def.radius * 0.5).fill({ color: 0x000000, alpha: 0.42 });

    if (texture) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(def.spriteHeight / texture.height);
      this.body.addChild(sprite);
    } else {
      this.body.addChild(placeholderBob(def.spriteHeight));
    }
    this.root.addChild(this.shadow, this.body);
  }

  update(p: Player, alpha: number, dt: number): void {
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const y = p.prevY + (p.y - p.prevY) * alpha;
    this.root.position.set(x, y);
    this.root.zIndex = y;

    const speed = Math.min(1, Math.sqrt(p.vx * p.vx + p.vy * p.vy) / p.moveSpeed);
    this.time += dt;
    // Advance by distance travelled so the feet never skate at low speed.
    this.walkPhase += (speed * p.moveSpeed * dt * Math.PI) / STRIDE;
    const hop = Math.abs(Math.sin(this.walkPhase)) * speed;
    const breathe = Math.sin(this.time * 2.4) * 0.014 * (1 - speed);

    this.facingScale += (p.facing - this.facingScale) * (1 - Math.exp(-TURN_RATE * dt));

    this.body.position.y = -hop * HOP_HEIGHT;
    this.body.scale.set(this.facingScale * (1 - hop * 0.04), 1 + hop * 0.06 + breathe);
    this.body.rotation = Math.max(-1, Math.min(1, p.vx / p.moveSpeed)) * LEAN;
    this.shadow.scale.set(1 - hop * 0.18);
  }
}

/** Fallback when no sprite has been prepared yet: a chunky shape-Bob, feet at 0. */
function placeholderBob(height: number): Graphics {
  const s = height / 72;
  const outline = { width: 3 * s, color: 0x14100c };
  return new Graphics()
    .roundRect(-13 * s, -14 * s, 10 * s, 14 * s, 3 * s)
    .fill(0x5a3a22)
    .stroke(outline)
    .roundRect(3 * s, -14 * s, 10 * s, 14 * s, 3 * s)
    .fill(0x5a3a22)
    .stroke(outline)
    .roundRect(-16 * s, -44 * s, 32 * s, 32 * s, 7 * s)
    .fill(0x2f4f9e)
    .stroke(outline)
    .rect(-16 * s, -24 * s, 32 * s, 3 * s)
    .fill(0xb08a4a)
    .circle(0, -56 * s, 15 * s)
    .fill(0xe6b48c)
    .stroke(outline)
    .ellipse(-2 * s, -66 * s, 15 * s, 7 * s)
    .fill(0x6b3f1e)
    .circle(5 * s, -55 * s, 2 * s)
    .fill(0x14100c);
}
