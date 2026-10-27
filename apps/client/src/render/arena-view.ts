import type { Arena } from '@game/sim';
import { Rng } from '@game/sim';
import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { makeDecalTextures, makeGroundTexture } from './textures';

/** Thickness of the dark hedge band outside the arena (wu). */
const BORDER = 70;
const FENCE_SPACING = 46;
const DECAL_COUNT = 260;

/** Ground, scattered decals and the fenced arena edge, all in world space. */
export function createArenaView(arena: Arena, seed: number): Container {
  // Render-only RNG: cosmetic scatter must never consume the sim's RNG.
  const rng = new Rng(seed ^ 0x5eed);
  const root = new Container();

  const ground = new TilingSprite({
    texture: makeGroundTexture(rng),
    width: arena.width,
    height: arena.height,
  });
  root.addChild(ground);

  const decalTypes = makeDecalTextures();
  const totalWeight = decalTypes.reduce((sum, d) => sum + d.weight, 0);
  const pickDecal = () => {
    let roll = rng.range(0, totalWeight);
    for (const d of decalTypes) {
      roll -= d.weight;
      if (roll < 0) return d.texture;
    }
    return decalTypes[decalTypes.length - 1]!.texture;
  };
  const decals = new Container();
  for (let i = 0; i < DECAL_COUNT; i++) {
    const decal = new Sprite(pickDecal());
    decal.anchor.set(0.5);
    decal.position.set(rng.range(30, arena.width - 30), rng.range(30, arena.height - 30));
    const size = rng.range(0.7, 1.35);
    decal.scale.set(rng.chance(0.5) ? size : -size, size);
    decal.alpha = rng.range(0.65, 1);
    decals.addChild(decal);
  }
  root.addChild(decals);

  root.addChild(createBorder(arena, rng));
  return root;
}

function createBorder(arena: Arena, rng: Rng): Graphics {
  const { width: w, height: h } = arena;
  const g = new Graphics();

  // Inner shadow so the play area reads as a sunken clearing: stacked
  // translucent bands just inside each edge, darkest at the fence.
  const band = 8;
  for (let i = 0; i < 7; i++) {
    const inset = i * band;
    const fill = { color: 0x000000, alpha: 0.3 - i * 0.04 };
    g.rect(inset, inset, w - inset * 2, band).fill(fill);
    g.rect(inset, h - inset - band, w - inset * 2, band).fill(fill);
    g.rect(inset, inset + band, band, h - (inset + band) * 2).fill(fill);
    g.rect(w - inset - band, inset + band, band, h - (inset + band) * 2).fill(fill);
  }

  // Dark hedge band.
  g.rect(-BORDER, -BORDER, w + BORDER * 2, BORDER).fill(0x0b0f0b);
  g.rect(-BORDER, h, w + BORDER * 2, BORDER).fill(0x0b0f0b);
  g.rect(-BORDER, 0, BORDER, h).fill(0x0b0f0b);
  g.rect(w, 0, BORDER, h).fill(0x0b0f0b);

  // Leaning wooden fence posts along the edge.
  const post = (x: number, y: number) => {
    const lean = rng.range(-2.5, 2.5);
    const tall = rng.range(14, 22);
    g.poly([x - 4, y + 4, x + 4, y + 4, x + 4 + lean, y - tall, x - 4 + lean, y - tall])
      .fill(0x3a2b1d)
      .stroke({ width: 2, color: 0x120d08 });
  };
  for (let x = 0; x <= w; x += FENCE_SPACING) {
    post(x, -6);
    post(x, h + 10);
  }
  for (let y = FENCE_SPACING; y < h; y += FENCE_SPACING) {
    post(-6, y);
    post(w + 6, y);
  }
  return g;
}
