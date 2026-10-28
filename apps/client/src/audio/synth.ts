/**
 * A tiny offline sound-design kit. SFX are rendered into plain Float32Arrays
 * once (no Web Audio graph per shot), so they cost one buffer source to play,
 * can be tested in Node, and come out the same every time for a given seed.
 *
 * Every layer method adds into the buffer; the effect methods (`drive`,
 * `crush`, `lofi`, `reverb`) process whatever has been added so far, so call
 * order matters.
 */

/** Low enough to keep the old-school grit, high enough for coin sparkle. */
export const SAMPLE_RATE = 32000;

/**
 * A value over the layer's lifetime: a constant, or breakpoints spread evenly
 * from start to end, joined by exponential (pitch-like) slides.
 */
export type Curve = number | readonly number[];

export type Wave = 'sine' | 'triangle' | 'saw' | 'square';

export interface Shape {
  /** Start time in seconds. */
  at?: number;
  /** Linear fade-in, seconds. */
  attack?: number;
  /** Full level after the attack, seconds. */
  hold?: number;
  /** Seconds from full level down to -60 dB. */
  decay: number;
  gain?: number;
  /** Amplitude wobble: [rate Hz, depth 0..1]. */
  tremolo?: readonly [number, number];
}

export interface Filter {
  type: 'lowpass' | 'highpass' | 'bandpass';
  freq: Curve;
  q?: number;
}

export interface ToneSpec extends Shape {
  wave: Wave;
  freq: Curve;
  /** With a two-point `freq`: time constant of a fast drop (drums, zaps) instead of an even slide. */
  glide?: number;
  /** [rate Hz, depth in semitones]. */
  vibrato?: readonly [number, number];
  /** Phase modulation by a sine at `freq * ratio`; `index` is the brightness. */
  fm?: { ratio: number; index: Curve };
  filter?: Filter;
}

export interface NoiseSpec extends Shape {
  filter?: Filter;
}

export interface PluckSpec extends Shape {
  freq: number;
  /** 0..1: how much of the pick's noise survives. */
  bright?: number;
}

export interface MetalSpec extends Shape {
  /** Base frequency of the inharmonic cluster. */
  freq: number;
  /** Highpass cutoff that turns the cluster into a shimmer. */
  cutoff?: number;
}

const TWO_PI = Math.PI * 2;
/** ln(1000): an exponential decay over `decay` seconds ends 60 dB down. */
const LN_60DB = 6.9078;
/** Filter coefficients are refreshed this often while a cutoff moves. */
const FILTER_BLOCK = 16;
/** Inharmonic ratios for metal clusters (the classic six-square cymbal). */
const METAL_RATIOS = [1, 1.342, 1.2312, 1.6532, 1.9523, 2.1523];

export class Sound {
  /** Grows when a reverb needs room for its tail. */
  data: Float32Array<ArrayBuffer>;
  readonly random: () => number;

  constructor(seconds: number, seed: number) {
    this.data = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
    this.random = mulberry32(seed);
  }

  /** A random number in [min, max). */
  rand(min: number, max: number): number {
    return min + (max - min) * this.random();
  }

  tone(spec: ToneSpec): this {
    const length = spanOf(spec);
    let phase = 0;
    let modPhase = 0;
    const vib = spec.vibrato;
    return this.layer(spec, (t) => {
      let f = value(spec.freq, t, length, spec.glide);
      if (vib) f *= Math.pow(2, (vib[1] * Math.sin(TWO_PI * vib[0] * t)) / 12);
      let p = phase;
      if (spec.fm) {
        modPhase = (modPhase + (f * spec.fm.ratio) / SAMPLE_RATE) % 1;
        p += (value(spec.fm.index, t, length) * Math.sin(TWO_PI * modPhase)) / TWO_PI;
      }
      phase = (phase + f / SAMPLE_RATE) % 1;
      return oscillator(spec.wave, p - Math.floor(p));
    });
  }

  noise(spec: NoiseSpec): this {
    return this.layer(spec, () => this.random() * 2 - 1);
  }

  /** A plucked string (Karplus-Strong): bowstrings, harpsichord, coin purses. */
  pluck(spec: PluckSpec): this {
    const period = Math.max(2, Math.round(SAMPLE_RATE / spec.freq));
    const line = new Float32Array(period);
    const bright = spec.bright ?? 0.6;
    let smooth = 0;
    for (let i = 0; i < period; i++) {
      const n = this.random() * 2 - 1;
      smooth += (n - smooth) * (0.2 + 0.8 * bright);
      line[i] = smooth;
    }
    // Loss per trip round the loop so the string itself dies in `decay` seconds.
    const loss = Math.pow(0.001, 1 / (spec.freq * spec.decay));
    let k = 0;
    return this.layer({ ...spec, decay: spec.decay * 4 }, () => {
      const next = (k + 1) % period;
      const out = line[k]!;
      line[k] = loss * 0.5 * (out + line[next]!);
      k = next;
      return out;
    });
  }

  /** Six detuned squares through a highpass: chinks, rings and cymbal hiss. */
  metal(spec: MetalSpec): this {
    const phases = METAL_RATIOS.map(() => this.random());
    const hp = new Biquad();
    hp.set('highpass', spec.cutoff ?? spec.freq * 3, 1.2);
    return this.layer(spec, () => {
      let sum = 0;
      for (let j = 0; j < METAL_RATIOS.length; j++) {
        const ph = (phases[j]! + (spec.freq * METAL_RATIOS[j]!) / SAMPLE_RATE) % 1;
        phases[j] = ph;
        sum += ph < 0.5 ? 1 : -1;
      }
      return hp.run(sum / METAL_RATIOS.length);
    });
  }

  /** Tanh saturation: louder, chunkier, rounder peaks. */
  drive(amount: number): this {
    const d = this.data;
    const peak = peakOf(d) || 1;
    const norm = Math.tanh(amount);
    for (let i = 0; i < d.length; i++) d[i] = (Math.tanh((d[i]! / peak) * amount) / norm) * peak;
    return this;
  }

  /** Bit-depth reduction relative to the current peak: retro crunch. */
  crush(bits: number): this {
    const d = this.data;
    const peak = peakOf(d) || 1;
    const steps = Math.pow(2, bits - 1);
    for (let i = 0; i < d.length; i++) d[i] = (Math.round((d[i]! / peak) * steps) / steps) * peak;
    return this;
  }

  /** Sample-and-hold down to `rate` Hz: aliasing grit, like an old sampler. */
  lofi(rate: number): this {
    const d = this.data;
    const step = SAMPLE_RATE / rate;
    let held = 0;
    let next = 0;
    for (let i = 0; i < d.length; i++) {
      if (i >= next) {
        held = d[i]!;
        next += step;
      }
      d[i] = held;
    }
    return this;
  }

  /**
   * A small Schroeder reverb (four damped combs into two allpasses), mixed in
   * at `mix`. `size` 0..1 scales the room and its decay (0.2 to 1.5 s); the
   * buffer grows to fit the tail.
   */
  reverb(mix: number, size = 0.6): this {
    const rt60 = 0.2 + 1.3 * size;
    const d = new Float32Array(this.data.length + Math.round(rt60 * SAMPLE_RATE));
    d.set(this.data);
    this.data = d;
    const wet = new Float32Array(d.length);
    for (const ms of [29.7, 37.1, 41.1, 43.7]) {
      const delay = Math.round(((ms * (0.6 + size)) / 1000) * SAMPLE_RATE);
      const feedback = Math.pow(0.001, delay / SAMPLE_RATE / rt60);
      const buf = new Float32Array(delay);
      let k = 0;
      let damp = 0;
      for (let i = 0; i < d.length; i++) {
        const out = buf[k]!;
        damp += (out - damp) * 0.45;
        buf[k] = d[i]! + damp * feedback;
        k = (k + 1) % delay;
        wet[i]! += out * 0.25;
      }
    }
    for (const ms of [5, 1.7]) {
      const delay = Math.round((ms / 1000) * SAMPLE_RATE);
      const buf = new Float32Array(delay);
      let k = 0;
      for (let i = 0; i < d.length; i++) {
        const delayed = buf[k]!;
        const input = wet[i]!;
        const out = -0.7 * input + delayed;
        buf[k] = input + 0.7 * out;
        k = (k + 1) % delay;
        wet[i] = out;
      }
    }
    for (let i = 0; i < d.length; i++) d[i] = d[i]! * (1 - mix * 0.5) + wet[i]! * mix;
    return this;
  }

  /**
   * Final pass: scales the loudest 30 ms to `levelDb` (RMS), soft-limits any
   * peak above -0.2 dBFS, trims the silent tail and fades the last few ms.
   */
  finish(levelDb: number): Float32Array<ArrayBuffer> {
    const d = this.data;
    const loudest = loudestRms(d);
    if (loudest > 0) {
      const scale = Math.pow(10, levelDb / 20) / loudest;
      for (let i = 0; i < d.length; i++) d[i] = softLimit(d[i]! * scale);
    }
    let end = d.length;
    while (end > 0 && Math.abs(d[end - 1]!) < 0.0005) end--;
    const out = d.slice(0, Math.max(end, 1));
    const fade = Math.min(out.length, Math.round(0.004 * SAMPLE_RATE));
    for (let i = 0; i < fade; i++) out[out.length - 1 - i]! *= i / fade;
    return out;
  }

  /** Adds `gen(t)` under the layer's envelope, through its filter if any. */
  private layer(spec: Shape & { filter?: Filter }, gen: (t: number) => number): this {
    const d = this.data;
    const start = Math.round((spec.at ?? 0) * SAMPLE_RATE);
    const span = spanOf(spec);
    const count = Math.min(Math.round(span * SAMPLE_RATE), d.length - start);
    const attack = spec.attack ?? 0.002;
    const hold = spec.hold ?? 0;
    const gain = spec.gain ?? 1;
    const filter = spec.filter;
    const biquad = filter ? new Biquad() : null;
    const trem = spec.tremolo;
    for (let i = 0; i < count; i++) {
      const t = i / SAMPLE_RATE;
      if (biquad && filter && i % FILTER_BLOCK === 0) {
        biquad.set(filter.type, value(filter.freq, t, span), filter.q ?? 0.9);
      }
      let x = gen(t);
      if (biquad) x = biquad.run(x);
      let env =
        t < attack
          ? t / attack
          : t < attack + hold
            ? 1
            : Math.exp((-LN_60DB * (t - attack - hold)) / spec.decay);
      if (trem) env *= 1 - trem[1] * (0.5 + 0.5 * Math.sin(TWO_PI * trem[0] * t));
      d[start + i]! += x * env * gain;
    }
    return this;
  }
}

/** RBJ cookbook biquad, transposed direct form II. */
class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  set(type: Filter['type'], freq: number, q: number): void {
    const w = (TWO_PI * Math.min(Math.max(freq, 20), SAMPLE_RATE * 0.45)) / SAMPLE_RATE;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    let b0: number;
    let b1: number;
    let b2: number;
    if (type === 'lowpass') {
      b1 = 1 - cos;
      b0 = b2 = b1 / 2;
    } else if (type === 'highpass') {
      b1 = -(1 + cos);
      b0 = b2 = -b1 / 2;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  run(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

function spanOf(spec: Shape): number {
  return (spec.attack ?? 0.002) + (spec.hold ?? 0) + spec.decay;
}

function value(curve: Curve, t: number, span: number, glide?: number): number {
  if (typeof curve === 'number') return curve;
  const n = curve.length;
  if (n === 1) return curve[0]!;
  if (n === 2 && glide) return curve[1]! + (curve[0]! - curve[1]!) * Math.exp(-t / glide);
  const pos = Math.min(Math.max(t / span, 0), 1) * (n - 1);
  const i = Math.min(Math.floor(pos), n - 2);
  const a = curve[i]!;
  const b = curve[i + 1]!;
  const f = pos - i;
  return a > 0 && b > 0 ? a * Math.pow(b / a, f) : a + (b - a) * f;
}

function oscillator(wave: Wave, phase: number): number {
  switch (wave) {
    case 'sine':
      return Math.sin(TWO_PI * phase);
    case 'triangle':
      return 4 * Math.abs(phase - 0.5) - 1;
    case 'saw':
      return 2 * phase - 1;
    case 'square':
      return phase < 0.5 ? 1 : -1;
  }
}

function peakOf(d: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!));
  return peak;
}

/** RMS of the loudest 30 ms window, a fair stand-in for how loud a short SFX feels. */
export function loudestRms(d: Float32Array): number {
  const win = Math.round(0.03 * SAMPLE_RATE);
  const hop = Math.round(0.005 * SAMPLE_RATE);
  let best = 0;
  for (let s = 0; s < Math.max(1, d.length - win + 1); s += hop) {
    let sum = 0;
    const end = Math.min(s + win, d.length);
    for (let i = s; i < end; i++) sum += d[i]! * d[i]!;
    best = Math.max(best, sum / win);
  }
  return Math.sqrt(best);
}

/** Linear below 0.7, then a tanh knee that never passes 0.98. */
function softLimit(x: number): number {
  const a = Math.abs(x);
  if (a <= 0.7) return x;
  return Math.sign(x) * (0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28));
}

/** Small, fast, seedable PRNG so every variant renders the same each time. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** MIDI note number → Hz. */
export function hz(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}
