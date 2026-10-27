#!/usr/bin/env node
// Turns one raw generated sprite into a game-ready PNG:
// trim to the alpha bounds, then downscale to a fixed height.
//
//   npm run sprite -- art/source/anchor-bob.png apps/client/public/sprites/bob.png [height]
//
// The full multi-sprite atlas packer arrives in Phase 2 (PLAN.md §6).
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [input, output, heightArg = '192'] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: prep-sprite.mjs <input.png> <output.png> [height=192]');
  process.exit(2);
}
const height = Number(heightArg);

const meta = await sharp(input).metadata();
if (!meta.hasAlpha) {
  console.error(`${input} has no alpha channel; generate it with --background transparent.`);
  process.exit(1);
}

await mkdir(path.dirname(output), { recursive: true });
// Trim against fully transparent pixels, not the top-left colour.
const trimmed = await sharp(input)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
  .toBuffer({ resolveWithObject: true });
await sharp(trimmed.data)
  .resize({ height, fit: 'inside', kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toFile(output);

const out = await sharp(output).metadata();
console.log(`${input} (${meta.width}×${meta.height}) → ${output} (${out.width}×${out.height})`);
