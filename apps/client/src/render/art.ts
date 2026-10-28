import type { EnemyId, WeaponId } from '@game/content';
import { Assets, BitmapFont, Graphics, Texture, type Renderer } from 'pixi.js';

/**
 * Phase 1 placeholder art (PLAN.md §10): chunky shapes with thick dark
 * outlines, baked once into textures so hundreds of sprites still batch.
 * Shapes are drawn in world units with the feet at (0, 0), facing right.
 * Generated sprites replace them in Phase 2; real PNGs win when present.
 */

export interface Baked {
  readonly texture: Texture;
  /** White silhouette of the same shape, for hit flashes. */
  readonly flash: Texture;
  /** Sprite anchor that puts (0, 0) of the drawing at the sprite position. */
  readonly anchorX: number;
  readonly anchorY: number;
  /** Sprite scale that shows the art at its intended world size. */
  readonly scale: number;
  /** Height in world units at that scale. */
  readonly height: number;
}

export type EnemyLook = Exclude<EnemyId, 'slimeMedium' | 'slimeSmall'> | 'wolf';

export interface Art {
  readonly bob: Baked;
  readonly enemies: Readonly<Record<EnemyLook, Baked>>;
  readonly shadow: Texture;
  readonly coin: Texture;
  readonly food: Texture;
  readonly projectiles: Readonly<Partial<Record<WeaponId, Texture>>>;
  readonly slash: Texture;
  readonly stab: Texture;
  readonly ring: Texture;
  readonly glow: Texture;
  readonly dot: Texture;
  readonly marker: Texture;
  readonly goo: Texture;
  readonly splat: { readonly red: Texture; readonly blue: Texture; readonly gold: Texture };
}

/** Bake resolution: crisp up to camera scale 1.5 on a DPR-2 screen. */
const RESOLUTION = 3;
const INK = 0x14100c;
const WHITE = 0xffffff;
export const SPLAT_FONT = 'splat';
export const HUD_FONT = 'hud';

type Painter = (g: Graphics, white: boolean) => void;

export async function createArt(renderer: Renderer, baseUrl: string): Promise<Art> {
  installFonts();
  const [bobPng, zombiePng] = await Promise.all([
    loadOptionalTexture(`${baseUrl}sprites/bob.png`),
    loadOptionalTexture(`${baseUrl}sprites/zombie.png`),
  ]);

  const bake = (paint: Painter): Baked => bakeShape(renderer, paint);
  const fromPng = (texture: Texture | null, height: number, fallback: Painter): Baked =>
    texture ? bakePng(texture, height) : bake(fallback);

  return {
    bob: fromPng(bobPng, 72, paintBob),
    enemies: {
      zombie: fromPng(zombiePng, 70, paintZombie),
      hand: bake(paintHand),
      slime: bake(paintSlime),
      werewolf: bake(paintVillager),
      wolf: bake(paintWolf),
    },
    shadow: radial(64, 24, [
      [0, 'rgba(0,0,0,1)'],
      [0.6, 'rgba(0,0,0,0.85)'],
      [1, 'rgba(0,0,0,0)'],
    ]),
    coin: bakeTexture(renderer, paintCoin),
    food: bakeTexture(renderer, paintFood),
    projectiles: {
      shortbow: bakeTexture(renderer, paintArrow),
      staff: radial(48, 48, [
        [0, 'rgba(255,255,255,1)'],
        [0.25, 'rgba(170,235,255,1)'],
        [0.55, 'rgba(70,160,255,0.55)'],
        [1, 'rgba(40,90,255,0)'],
      ]),
      boomchin: bakeTexture(renderer, paintBoomchin),
    },
    slash: bakeTexture(renderer, paintSlash),
    stab: bakeTexture(renderer, paintStab),
    ring: bakeTexture(renderer, (g) => g.circle(0, 0, 50).stroke({ width: 6, color: WHITE })),
    glow: radial(128, 128, [
      [0, 'rgba(255,255,255,1)'],
      [0.35, 'rgba(255,255,255,0.6)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
    dot: radial(16, 16, [
      [0, 'rgba(255,255,255,1)'],
      [0.5, 'rgba(255,255,255,0.9)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
    marker: bakeTexture(renderer, paintMarker),
    goo: radial(128, 128, [
      [0, 'rgba(120,190,60,0.75)'],
      [0.7, 'rgba(90,150,40,0.6)'],
      [1, 'rgba(60,110,30,0)'],
    ]),
    splat: {
      red: bakeTexture(renderer, (g) => paintSplat(g, 0xb3150f, 0x4a0705)),
      blue: bakeTexture(renderer, (g) => paintSplat(g, 0x2a5bd7, 0x0b1d4f)),
      gold: bakeTexture(renderer, (g) => paintSplat(g, 0xe0660d, 0x5a2203)),
    },
  };
}

function installFonts(): void {
  const family = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
  BitmapFont.install({
    name: SPLAT_FONT,
    style: {
      fontFamily: family,
      fontSize: 32,
      fontWeight: 'bold',
      fill: WHITE,
      stroke: { color: 0x000000, width: 5, join: 'round' },
    },
    chars: [['0', '9']],
    resolution: 2,
  });
  BitmapFont.install({
    name: HUD_FONT,
    style: {
      fontFamily: family,
      fontSize: 32,
      fontWeight: 'bold',
      fill: WHITE,
      stroke: { color: 0x000000, width: 5, join: 'round' },
    },
    chars: [[' ', '~']],
    resolution: 2,
  });
}

/** Loads a texture if the file exists; callers fall back to placeholder art otherwise. */
async function loadOptionalTexture(url: string): Promise<Texture | null> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok || !head.headers.get('content-type')?.startsWith('image/')) return null;
    return await Assets.load<Texture>(url);
  } catch {
    return null;
  }
}

function bakeShape(renderer: Renderer, paint: Painter): Baked {
  const g = new Graphics();
  paint(g, false);
  // Both textures share one frame so the flash lines up exactly.
  const frame = g.getLocalBounds().rectangle.clone();
  const texture = renderer.generateTexture({ target: g, frame, resolution: RESOLUTION, antialias: true });
  g.clear();
  paint(g, true);
  const flash = renderer.generateTexture({ target: g, frame, resolution: RESOLUTION, antialias: true });
  g.destroy();
  return {
    texture,
    flash,
    anchorX: -frame.x / frame.width,
    anchorY: -frame.y / frame.height,
    scale: 1,
    height: frame.height,
  };
}

function bakeTexture(renderer: Renderer, paint: Painter): Texture {
  const g = new Graphics();
  paint(g, false);
  const texture = renderer.generateTexture({ target: g, resolution: RESOLUTION, antialias: true });
  g.destroy();
  return texture;
}

/** A transparent PNG whose bottom edge is the feet; flash via a white-filled copy. */
function bakePng(texture: Texture, height: number): Baked {
  const source = texture.source.resource as CanvasImageSource;
  const { width: w, height: h } = texture.source;
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  return { texture, flash: Texture.from(el), anchorX: 0.5, anchorY: 1, scale: height / h, height };
}

function radial(width: number, height: number, stops: readonly [number, string][]): Texture {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.translate(width / 2, height / 2);
  ctx.scale(width / 2, height / 2);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  return Texture.from(el);
}

// ---------------------------------------------------------------- painters

const outline = (white: boolean, width = 3) => ({ width, color: white ? WHITE : INK, join: 'round' as const });
const fill = (white: boolean, color: number) => (white ? WHITE : color);

function paintBob(g: Graphics, white: boolean): void {
  paintPerson(g, white, { skin: 0xe6b48c, shirt: 0x2f4f9e, legs: 0x5a3a22, hair: 0x6b3f1e, eye: INK });
}

function paintZombie(g: Graphics, white: boolean): void {
  paintPerson(g, white, { skin: 0x8fa36a, shirt: 0x4d5a3a, legs: 0x3b3326, hair: 0x2f2a1e, eye: 0xd8e04a });
}

interface PersonColours {
  skin: number;
  shirt: number;
  legs: number;
  hair: number;
  eye: number;
}

function paintPerson(g: Graphics, white: boolean, c: PersonColours): void {
  const o = outline(white);
  g.roundRect(-13, -14, 10, 14, 3).fill(fill(white, c.legs)).stroke(o);
  g.roundRect(3, -14, 10, 14, 3).fill(fill(white, c.legs)).stroke(o);
  g.roundRect(-16, -44, 32, 32, 7).fill(fill(white, c.shirt)).stroke(o);
  g.circle(0, -56, 15).fill(fill(white, c.skin)).stroke(o);
  g.ellipse(-2, -66, 15, 7).fill(fill(white, c.hair));
  g.circle(5, -55, 2.2).fill(fill(white, c.eye));
}

function paintHand(g: Graphics, white: boolean): void {
  const skin = fill(white, 0xcdc4a3);
  const o = outline(white, 2.5);
  // Fingers first so the palm outline sits on top of their roots.
  const fingers: [number, number, number][] = [
    [-15, 13, 3.6],
    [-11.5, 15, 3.6],
    [-8, 14, 3.6],
    [-4.5, 11, 3.4],
  ];
  for (const [y, length, thickness] of fingers) {
    g.roundRect(2, y, length, thickness, thickness / 2).fill(skin).stroke(o);
  }
  g.roundRect(-4, -3.5, 10, 3.6, 1.8).fill(skin).stroke(o);
  g.roundRect(-14, -16, 20, 13, 6).fill(skin).stroke(o);
  g.ellipse(-14, -9.5, 2.6, 5).fill(fill(white, 0x6a1c14));
}

function paintSlime(g: Graphics, white: boolean): void {
  g.moveTo(-26, 0)
    .bezierCurveTo(-29, -28, -12, -40, 0, -40)
    .bezierCurveTo(12, -40, 29, -28, 26, 0)
    .closePath()
    .fill(fill(white, 0x5d9b3a))
    .stroke(outline(white));
  if (white) return;
  g.ellipse(-10, -27, 6, 4).fill({ color: 0xb8ec88, alpha: 0.85 });
  g.circle(6, -22, 3.4).fill(INK);
  g.circle(15, -20, 2.8).fill(INK);
  g.circle(7, -23, 1).fill(WHITE);
  g.moveTo(4, -12).quadraticCurveTo(10, -9, 16, -12).stroke({ width: 2, color: INK });
}

function paintVillager(g: Graphics, white: boolean): void {
  const o = outline(white);
  g.roundRect(-12, -14, 10, 14, 3).fill(fill(white, 0x3a2d22)).stroke(o);
  g.roundRect(3, -14, 10, 14, 3).fill(fill(white, 0x3a2d22)).stroke(o);
  // Ragged cloak.
  g.poly([-18, -46, 16, -46, 19, -12, 10, -16, 4, -11, -4, -16, -12, -11, -19, -14])
    .fill(fill(white, 0x6b4a2b))
    .stroke(o);
  g.circle(1, -58, 15).fill(fill(white, 0xd9b08a)).stroke(o);
  // Shaggy hair and sideburns hint at what's coming.
  g.poly([-15, -60, -10, -74, 0, -72, 12, -74, 15, -62, 9, -66, 0, -64, -8, -66])
    .fill(fill(white, 0x3b2a1c))
    .stroke(o);
  if (white) return;
  g.circle(7, -57, 2.2).fill(0xd8b13a);
  g.rect(-13, -56, 4, 8).fill(0x3b2a1c);
}

function paintWolf(g: Graphics, white: boolean): void {
  const fur = fill(white, 0x5e5247);
  const dark = fill(white, 0x3a322b);
  const o = outline(white);
  // Digitigrade legs.
  g.poly([-16, 0, -6, 0, -8, -14, -2, -26, -12, -30, -18, -16]).fill(dark).stroke(o);
  g.poly([6, 0, 16, 0, 14, -14, 18, -26, 8, -30, 4, -16]).fill(dark).stroke(o);
  // Hunched torso.
  g.ellipse(-2, -46, 24, 22).fill(fur).stroke(o);
  // Arms with claws.
  g.poly([10, -50, 30, -34, 34, -24, 28, -26, 26, -30, 8, -38]).fill(dark).stroke(o);
  // Head and snout facing right.
  g.poly([4, -70, 14, -76, 30, -70, 42, -66, 40, -60, 28, -58, 14, -56, 4, -60])
    .fill(fur)
    .stroke(o);
  g.poly([6, -72, 8, -88, 16, -74]).fill(dark).stroke(o);
  g.poly([16, -74, 20, -88, 24, -72]).fill(dark).stroke(o);
  if (white) return;
  g.circle(22, -67, 2.6).fill(0xff3a24);
  g.poly([30, -60, 34, -56, 36, -60]).fill(WHITE);
  g.circle(41, -63, 2).fill(INK);
}

function paintCoin(g: Graphics): void {
  g.circle(0, 0, 7).fill(0xe8b632).stroke({ width: 2, color: 0x6e4a0a });
  g.circle(0, 0, 4).stroke({ width: 1.2, color: 0xb07f12 });
  g.circle(-2.4, -2.6, 1.6).fill({ color: 0xfff3b0, alpha: 0.9 });
}

function paintFood(g: Graphics): void {
  // A drumstick: always readable as "heals".
  g.roundRect(2, -2, 10, 4, 2).fill(0xf1ead8).stroke({ width: 1.5, color: INK });
  g.circle(12, -2.5, 2.4).fill(0xf1ead8).stroke({ width: 1.5, color: INK });
  g.circle(12, 2.5, 2.4).fill(0xf1ead8).stroke({ width: 1.5, color: INK });
  g.ellipse(-4, 0, 9, 7).fill(0xa4521f).stroke({ width: 2, color: INK });
  g.ellipse(-6, -2.5, 3, 1.8).fill({ color: 0xe0915a, alpha: 0.9 });
}

function paintArrow(g: Graphics): void {
  g.moveTo(-14, 0).lineTo(10, 0).stroke({ width: 2.4, color: 0x8a6a3e });
  g.poly([16, 0, 8, -4, 8, 4]).fill(0xc8ccd2).stroke({ width: 1, color: INK });
  g.poly([-14, 0, -18, -4, -10, -1]).fill(0xe8e2d0);
  g.poly([-14, 0, -18, 4, -10, 1]).fill(0xe8e2d0);
}

function paintBoomchin(g: Graphics): void {
  g.circle(0, 0, 8).fill(0x8d8578).stroke({ width: 2, color: INK });
  g.circle(-5, -7, 3).fill(0x8d8578).stroke({ width: 1.5, color: INK });
  g.circle(5, -7, 3).fill(0x8d8578).stroke({ width: 1.5, color: INK });
  g.circle(-2.5, -1, 1.4).fill(INK);
  g.circle(2.5, -1, 1.4).fill(INK);
  g.moveTo(-1, 3).lineTo(1, 3).stroke({ width: 1.2, color: 0xffd23d });
}

/** A crescent facing +x, 100 wu across; rotated and scaled per swing. */
function paintSlash(g: Graphics): void {
  const steps = 18;
  const span = 1.2;
  const outer: number[] = [];
  const inner: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = -span + t * span * 2;
    const thickness = Math.sin(t * Math.PI) * 14;
    outer.push(Math.cos(a) * 50, Math.sin(a) * 50);
    inner.unshift(Math.cos(a) * (50 - thickness), Math.sin(a) * (50 - thickness));
  }
  g.poly([...outer, ...inner]).fill(WHITE);
}

function paintStab(g: Graphics): void {
  g.poly([0, -3, 50, 0, 0, 3]).fill(WHITE);
}

function paintMarker(g: Graphics): void {
  const bar = (angle: number) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const hw = 12;
    const hh = 3;
    g.poly([-hw * c + hh * s, -hw * s - hh * c, hw * c + hh * s, hw * s - hh * c, hw * c - hh * s, hw * s + hh * c, -hw * c - hh * s, -hw * s + hh * c])
      .fill(0xd42a1e)
      .stroke({ width: 2, color: 0x3a0806 });
  };
  bar(Math.PI / 4);
  bar(-Math.PI / 4);
}

/** A jagged blob like the classic damage splat. */
function paintSplat(g: Graphics, colour: number, rim: number): void {
  const points: number[] = [];
  const spikes = 9;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 17 : 12.5;
    points.push(Math.cos(a) * r, Math.sin(a) * r * 0.86);
  }
  g.poly(points).fill(colour).stroke({ width: 2.5, color: rim, join: 'round' });
}
