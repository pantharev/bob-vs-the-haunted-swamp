import { Rng } from '@game/sim';
import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import type { Camera } from './camera';
import { DARKNESS_ALPHA, makeDarknessTexture, makeFogTexture } from './textures';

/** Distance from Bob at which the lantern light is fully gone (wu). */
const LIGHT_REACH = 560;

interface FogLayer {
  sprite: TilingSprite;
  /** World units per fog-texture tile. */
  tileWorldSize: number;
  /** How much the layer moves with the camera (1 = glued to the ground). */
  parallax: number;
  driftX: number;
  driftY: number;
}

/**
 * Screen-space mood: two drifting fog layers with parallax, then darkness
 * with a lantern-lit circle that follows Bob.
 */
export class Atmosphere {
  readonly root = new Container();
  private readonly fog: FogLayer[];
  private readonly light = new Sprite(makeDarknessTexture());
  private readonly outerDark = new Graphics();
  private time = 0;

  constructor(seed: number) {
    const rng = new Rng(seed ^ 0xf06);
    const fogTexture = makeFogTexture(rng);
    this.fog = [
      { tileWorldSize: 900, parallax: 1.0, driftX: 9, driftY: 3, alpha: 0.13 },
      { tileWorldSize: 1400, parallax: 1.25, driftX: -6, driftY: 5, alpha: 0.1 },
    ].map(({ alpha, ...layer }) => {
      const sprite = new TilingSprite({ texture: fogTexture, width: 1, height: 1 });
      sprite.alpha = alpha;
      this.root.addChild(sprite);
      return { sprite, ...layer };
    });

    this.light.anchor.set(0.5);
    this.root.addChild(this.light, this.outerDark);
  }

  update(
    camera: Camera,
    focusX: number,
    focusY: number,
    screenW: number,
    screenH: number,
    dt: number,
    lightScale = 1,
  ) {
    this.time += dt;
    const s = camera.scale;

    for (const layer of this.fog) {
      const { sprite } = layer;
      sprite.width = screenW;
      sprite.height = screenH;
      const tileScale = (layer.tileWorldSize * s) / sprite.texture.width;
      sprite.tileScale.set(tileScale);
      // World position under the screen's top-left corner, scaled by parallax, plus slow drift.
      const left = camera.x - screenW / 2 / s;
      const top = camera.y - screenH / 2 / s;
      sprite.tilePosition.set(
        (-left * layer.parallax + this.time * layer.driftX) * s,
        (-top * layer.parallax + this.time * layer.driftY) * s,
      );
    }

    // Lantern flicker: two slow sines, so it never looks like a regular pulse.
    const flicker = 1 + Math.sin(this.time * 7.3) * 0.012 + Math.sin(this.time * 2.1) * 0.018;
    const size = LIGHT_REACH * 2 * s * flicker * lightScale;
    const cx = (focusX - camera.x) * s + screenW / 2;
    const cy = (focusY - camera.y) * s + screenH / 2;
    this.light.position.set(cx, cy);
    this.light.width = size;
    this.light.height = size;

    // Everything outside the light sprite gets the same flat darkness.
    const half = size / 2;
    const left = cx - half;
    const right = cx + half;
    const top = cy - half;
    const bottom = cy + half;
    const fill = { color: 0x040609, alpha: DARKNESS_ALPHA };
    const g = this.outerDark.clear();
    if (top > 0) g.rect(0, 0, screenW, top).fill(fill);
    if (bottom < screenH) g.rect(0, bottom, screenW, screenH - bottom).fill(fill);
    if (left > 0) g.rect(0, Math.max(0, top), left, Math.min(screenH, bottom) - Math.max(0, top)).fill(fill);
    if (right < screenW)
      g.rect(right, Math.max(0, top), screenW - right, Math.min(screenH, bottom) - Math.max(0, top)).fill(fill);
  }
}
