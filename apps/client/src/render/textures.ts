import { Rng } from '@game/sim';
import { Texture } from 'pixi.js';

/**
 * Procedural textures, generated once at boot from a seeded RNG. Ground,
 * fog and darkness are things image models do badly and code does well
 * (PLAN.md §6), and generating them keeps the download tiny.
 */

type Rgb = readonly [number, number, number];

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (lo: number, hi: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/**
 * Tileable fractal value noise in [0, 1]. Each octave's lattice wraps, and
 * `cells` must divide `size`, so the result tiles seamlessly.
 */
function tileableNoise(rng: Rng, size: number, octaves: readonly [cells: number, weight: number][]) {
  const out = new Float32Array(size * size);
  let totalWeight = 0;
  for (const [cells, weight] of octaves) {
    totalWeight += weight;
    const lattice = Float32Array.from({ length: cells * cells }, () => rng.next());
    const cellSize = size / cells;
    for (let y = 0; y < size; y++) {
      const gy = y / cellSize;
      const y0 = Math.floor(gy);
      const ty = smooth(gy - y0);
      const row0 = (y0 % cells) * cells;
      const row1 = ((y0 + 1) % cells) * cells;
      for (let x = 0; x < size; x++) {
        const gx = x / cellSize;
        const x0 = Math.floor(gx);
        const tx = smooth(gx - x0);
        const c0 = x0 % cells;
        const c1 = (x0 + 1) % cells;
        const top = lerp(lattice[row0 + c0]!, lattice[row0 + c1]!, tx);
        const bottom = lerp(lattice[row1 + c0]!, lattice[row1 + c1]!, tx);
        const i = y * size + x;
        out[i] = out[i]! + lerp(top, bottom, ty) * weight;
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / totalWeight;
  return out;
}

function canvas(width: number, height: number) {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { el, ctx };
}

const DEEP_MOSS: Rgb = [20, 30, 22];
const MOSS: Rgb = [38, 52, 32];
const SICKLY: Rgb = [58, 68, 40];
const MUD: Rgb = [42, 36, 30];
const BOG: Rgb = [34, 27, 40];

/** 512 px seamless swamp ground: moss, mud and purple bog, with grain and tufts. */
export function makeGroundTexture(rng: Rng): Texture {
  const size = 512;
  const height = tileableNoise(rng, size, [
    [4, 0.5],
    [8, 0.3],
    [32, 0.15],
    [64, 0.05],
  ]);
  const moisture = tileableNoise(rng, size, [
    [2, 0.4],
    [4, 0.4],
    [16, 0.2],
  ]);
  const { el, ctx } = canvas(size, size);
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const h = height[i]!;
    const m = moisture[i]!;
    let c = mix(DEEP_MOSS, MOSS, smoothstep(0.3, 0.7, h));
    c = mix(c, SICKLY, smoothstep(0.62, 0.8, h) * 0.6);
    c = mix(c, MUD, smoothstep(0.55, 0.72, m) * 0.8);
    c = mix(c, BOG, smoothstep(0.32, 0.18, m) * 0.7);
    const grain = (rng.next() - 0.5) * 10;
    image.data[i * 4] = c[0] + grain;
    image.data[i * 4 + 1] = c[1] + grain;
    image.data[i * 4 + 2] = c[2] + grain;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  // Grass tufts, drawn at every wrapped offset so ones crossing an edge still tile.
  ctx.lineCap = 'round';
  for (let n = 0; n < 140; n++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const blades = rng.int(2, 4);
    const shade = rng.pick(['#3f4f2a', '#4b5a30', '#2f3d24', '#55603a']);
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.strokeStyle = shade;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let b = 0; b < blades; b++) {
          const lean = (b - (blades - 1) / 2) * 2.2;
          ctx.moveTo(x + ox + b * 1.6, y + oy);
          ctx.quadraticCurveTo(x + ox + b * 1.6 + lean * 0.5, y + oy - 4, x + ox + b * 1.6 + lean, y + oy - 7);
        }
        ctx.stroke();
      }
    }
  }
  return Texture.from(el);
}

/** 256 px seamless wisps of pale green fog (alpha only where the noise is high). */
export function makeFogTexture(rng: Rng): Texture {
  const size = 256;
  const noise = tileableNoise(rng, size, [
    [2, 0.45],
    [4, 0.35],
    [8, 0.2],
  ]);
  const { el, ctx } = canvas(size, size);
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    image.data[i * 4] = 196;
    image.data[i * 4 + 1] = 214;
    image.data[i * 4 + 2] = 200;
    image.data[i * 4 + 3] = smoothstep(0.42, 0.8, noise[i]!) * 255;
  }
  ctx.putImageData(image, 0, 0);
  return Texture.from(el);
}

/** Alpha of the darkness beyond the lantern's reach. Enemies must stay readable. */
export const DARKNESS_ALPHA = 0.64;
export const DARKNESS_RGB = 'rgb(4 6 9';

/** Radial lantern falloff: clear centre, `DARKNESS_ALPHA` at the texture's edge. */
export function makeDarknessTexture(): Texture {
  const size = 512;
  const { el, ctx } = canvas(size, size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `${DARKNESS_RGB} / 0)`);
  gradient.addColorStop(0.42, `${DARKNESS_RGB} / 0)`);
  gradient.addColorStop(0.72, `${DARKNESS_RGB} / ${DARKNESS_ALPHA * 0.55})`);
  gradient.addColorStop(1, `${DARKNESS_RGB} / ${DARKNESS_ALPHA})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(el);
}

export interface Decal {
  texture: Texture;
  /** Relative frequency when scattering. */
  weight: number;
}

/** Small ground decals scattered over the arena so movement has reference points. */
export function makeDecalTextures(): Decal[] {
  const decals: Decal[] = [];
  const push = (el: HTMLCanvasElement, weight: number) =>
    decals.push({ texture: Texture.from(el), weight });

  {
    // Bog puddle with a sickly purple sheen.
    const { el, ctx } = canvas(112, 56);
    ctx.fillStyle = '#0d1418';
    ctx.beginPath();
    ctx.ellipse(56, 28, 52, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgb(92 78 120 / 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(50, 24, 34, 12, 0, Math.PI * 1.1, Math.PI * 1.7);
    ctx.stroke();
    push(el, 2);
  }
  {
    // Mossy stone.
    const { el, ctx } = canvas(44, 34);
    ctx.fillStyle = '#3a4038';
    ctx.strokeStyle = '#11140f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(6, 26);
    ctx.quadraticCurveTo(4, 8, 20, 6);
    ctx.quadraticCurveTo(40, 6, 39, 24);
    ctx.quadraticCurveTo(24, 31, 6, 26);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4c5a34';
    ctx.beginPath();
    ctx.ellipse(18, 12, 9, 4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    push(el, 3);
  }
  {
    // Old bone, half-sunk and dull so it never competes with gameplay pickups.
    const { el, ctx } = canvas(28, 14);
    ctx.fillStyle = '#7d7764';
    ctx.strokeStyle = '#1f1c16';
    ctx.lineWidth = 1.5;
    const knob = (x: number, y: number) => {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    knob(5, 5);
    knob(5, 9);
    knob(23, 5);
    knob(23, 9);
    ctx.fillRect(5, 5, 18, 4);
    ctx.strokeRect(5, 5, 18, 4);
    push(el, 1);
  }
  {
    // Cluster of glowing purple toadstools.
    const { el, ctx } = canvas(34, 30);
    for (const [x, y, r] of [
      [10, 18, 6],
      [21, 14, 8],
      [27, 22, 5],
    ] as const) {
      ctx.fillStyle = '#d8d0bb';
      ctx.fillRect(x - 1.5, y, 3, 8);
      ctx.fillStyle = '#7d4f9e';
      ctx.strokeStyle = '#1b1222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    push(el, 1.5);
  }
  {
    // Dead grass patch.
    const { el, ctx } = canvas(48, 30);
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 11; i++) {
      ctx.strokeStyle = i % 2 ? '#6b6340' : '#4f4a30';
      const x = 6 + i * 3.6;
      ctx.beginPath();
      ctx.moveTo(x, 28);
      ctx.quadraticCurveTo(x + (i - 5) * 0.8, 16, x + (i - 5) * 1.6, 6 + (i % 3) * 3);
      ctx.stroke();
    }
    push(el, 4);
  }
  return decals;
}
