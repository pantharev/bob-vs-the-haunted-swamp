import * as Tone from 'tone';
import { layerMix, sceneTempo, type Mix, type MusicEngine, type MusicScene } from './music';
import { BEATS_PER_BAR, SONG, STINGS, VOICE_IDS, type NoteEvent, type VoiceId } from './score';

/**
 * Adaptive music on Tone.js (PLAN.md §7). One looping score, ten layers, each
 * on its own gain; scenes and intensity only move those gains and the tempo,
 * so changes are seamless. Loaded lazily after the first tap.
 */

/** Output level of the whole music bus, below the SFX. */
const LEVEL = 0.35;
const DUCKED = 0.3;

export interface ToneMusicOptions {
  /** The game's AudioContext, shared with the SFX. Omit inside `Tone.Offline`. */
  context?: AudioContext;
  output?: AudioNode;
}

export async function createToneMusic(options: ToneMusicOptions = {}): Promise<ToneMusic> {
  if (options.context && Tone.getContext().rawContext !== options.context) {
    // Importing Tone made a context of its own; swap in ours and close that one.
    Tone.setContext(options.context, true);
    // Music can afford a deeper buffer than SFX, which skip Tone entirely.
    Tone.getContext().lookAhead = 0.2;
  }
  const music = new ToneMusic(options.output);
  await music.ready;
  return music;
}

interface Voice {
  gain: Tone.Gain;
  play(notes: string[], seconds: number, time: number, velocity: number): void;
}

interface Scheduled {
  time: string;
  voice: VoiceId;
  note: NoteEvent;
}

interface Disposable {
  dispose(): unknown;
}

export class ToneMusic implements MusicEngine {
  readonly ready: Promise<void>;
  private readonly transport = Tone.getTransport();
  private readonly nodes: Disposable[] = [];
  private readonly out: Tone.Gain;
  private readonly voices: Record<VoiceId, Voice>;
  private readonly part: Tone.Part<Scheduled>;
  private targets: Mix = layerMix('victory', 0);
  private scene: MusicScene | null = null;
  private intensity = 0;
  private enabled = true;
  private ducked = false;

  constructor(output?: AudioNode) {
    const reverb = this.own(new Tone.Reverb({ decay: 4.5, preDelay: 0.03, wet: 0.3 }));
    const bus = this.own(new Tone.Gain(1));
    this.out = this.own(new Tone.Gain(0));
    bus.chain(reverb, this.own(new Tone.Limiter(-3)), this.out);
    if (output) this.out.connect(output);
    else this.out.toDestination();
    this.ready = reverb.ready;
    this.voices = this.buildVoices(bus);

    const events: Scheduled[] = [];
    for (const voice of VOICE_IDS) {
      for (const note of SONG.voices[voice]) events.push({ time: ticks(note.beat), voice, note });
    }
    this.part = this.own(new Tone.Part<Scheduled>((time, ev) => this.trigger(ev, time), events));
    this.part.loop = true;
    this.part.loopEnd = ticks(SONG.bars * BEATS_PER_BAR);
    this.part.start(0);
    this.transport.timeSignature = BEATS_PER_BAR;
  }

  setScene(scene: MusicScene): void {
    if (scene === this.scene) return;
    const previous = this.scene;
    this.scene = scene;
    if (this.enabled) this.applyScene(previous);
  }

  setIntensity(intensity: number): void {
    if (Math.abs(intensity - this.intensity) < 0.01) return;
    this.intensity = intensity;
    if (!this.enabled || this.scene !== 'wave') return;
    this.mixTo(layerMix('wave', intensity), 2.5);
    this.transport.bpm.rampTo(sceneTempo('wave', intensity), 4);
  }

  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.updateOutput(0.4);
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.updateOutput(0.3);
    if (!enabled) {
      this.transport.stop('+0.35');
    } else if (this.scene !== 'victory' && this.scene !== 'defeat') {
      // Coming back on: start the current scene from the top.
      this.applyScene(null);
    }
  }

  dispose(): void {
    this.transport.stop();
    for (const node of this.nodes) node.dispose();
  }

  private applyScene(previous: MusicScene | null): void {
    const scene = this.scene;
    if (!scene) return;
    this.updateOutput(0.3);
    if (scene === 'victory' || scene === 'defeat') {
      this.playSting(scene);
      return;
    }
    // Wave and shop flow into each other; anything else starts the tune over.
    const continuous =
      this.transport.state === 'started' &&
      (previous === 'wave' || previous === 'shop') &&
      (scene === 'wave' || scene === 'shop');
    const bpm = sceneTempo(scene, this.intensity);
    if (continuous) {
      this.transport.bpm.rampTo(bpm, 2);
      this.mixTo(layerMix(scene, this.intensity), 1.5);
    } else {
      this.transport.stop();
      this.transport.position = 0;
      this.transport.bpm.value = bpm;
      this.mixTo(layerMix(scene, this.intensity), 0.05);
      this.transport.start('+0.05');
    }
  }

  private playSting(kind: 'victory' | 'defeat'): void {
    this.transport.stop();
    const sting = STINGS[kind];
    const mix = layerMix(kind, 0);
    for (const id of VOICE_IDS) if (sting.voices[id]) mix[id] = 1;
    this.mixTo(mix, 0.3);
    // Past the look-ahead window, so mono synths never get an earlier note than one already queued.
    const start = Tone.now() + 0.3;
    const beat = 60 / sting.bpm;
    for (const id of VOICE_IDS) {
      for (const note of sting.voices[id] ?? []) {
        this.voices[id].play(
          note.notes,
          note.beats * beat,
          start + note.beat * beat,
          note.velocity,
        );
      }
    }
  }

  private trigger(ev: Scheduled, time: number): void {
    const voice = this.voices[ev.voice];
    // Silent layers don't play at all, which keeps phones cool.
    if (this.targets[ev.voice] === 0 && voice.gain.gain.getValueAtTime(time) < 0.001) return;
    const beat = 60 / this.transport.bpm.getValueAtTime(time);
    voice.play(ev.note.notes, ev.note.beats * beat, time, ev.note.velocity);
  }

  private mixTo(mix: Mix, seconds: number): void {
    this.targets = mix;
    for (const id of VOICE_IDS) this.voices[id].gain.gain.rampTo(mix[id], seconds);
  }

  private updateOutput(seconds: number): void {
    const level = this.enabled ? LEVEL * (this.ducked ? DUCKED : 1) : 0;
    this.out.gain.rampTo(level, seconds);
  }

  private own<T extends Disposable>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  /** The band. Volumes (dB) were balanced from offline renders of each solo layer. */
  private buildVoices(bus: Tone.Gain): Record<VoiceId, Voice> {
    const layer = (...chain: Tone.ToneAudioNode[]): Tone.Gain => {
      const gain = this.own(new Tone.Gain(0));
      for (const node of chain) this.own(node);
      gain.connect(bus);
      if (chain.length > 0) {
        Tone.connectSeries(...chain, gain);
      }
      return gain;
    };
    const poly = (synth: Tone.PolySynth, ...fx: Tone.ToneAudioNode[]): Voice => {
      const gain = layer(...fx);
      synth.connect(fx[0] ?? gain);
      this.own(synth);
      return { gain, play: (notes, s, t, v) => synth.triggerAttackRelease(notes, s, t, v) };
    };
    const mono = (synth: Mono, ...fx: Tone.ToneAudioNode[]): Voice => {
      const gain = layer(...fx);
      synth.connect(fx[0] ?? gain);
      this.own(synth);
      return { gain, play: (notes, s, t, v) => synth.triggerAttackRelease(notes[0]!, s, t, v) };
    };

    const harpsichord = (volume: number) =>
      new Tone.PolySynth(Tone.FMSynth, {
        volume,
        harmonicity: 3,
        modulationIndex: 12,
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.001, decay: 0.7, sustain: 0, release: 0.35 },
        modulation: { type: 'square' },
        modulationEnvelope: { attack: 0.002, decay: 0.18, sustain: 0, release: 0.2 },
      });

    const echo = new Tone.FeedbackDelay('4n.', 0.22);
    echo.wet.value = 0.18;

    return {
      // Plucked double bass.
      bass: mono(
        new Tone.MonoSynth({
          volume: -5,
          oscillator: { type: 'sawtooth' },
          filter: { type: 'lowpass', Q: 1, rolloff: -24 },
          filterEnvelope: {
            attack: 0.002,
            decay: 0.12,
            sustain: 0.05,
            release: 0.2,
            baseFrequency: 90,
            octaves: 2.5,
          },
          envelope: { attack: 0.003, decay: 0.6, sustain: 0, release: 0.25 },
        }),
      ),
      // Church organ: a few soft drawbar partials, slow to speak.
      organ: poly(
        new Tone.PolySynth(Tone.Synth, {
          volume: -20,
          oscillator: { type: 'custom', partials: [1, 0.55, 0.3, 0.16, 0.1, 0.05] },
          envelope: { attack: 0.35, decay: 0.3, sustain: 0.85, release: 1.4 },
        }),
        new Tone.Filter(1800, 'lowpass'),
        new Tone.Chorus(0.6, 3.5, 0.4).start(),
      ),
      waltz: poly(harpsichord(-1), new Tone.Filter(220, 'highpass')),
      arp: poly(harpsichord(-2), new Tone.Filter(220, 'highpass')),
      // Hollow, clarinet-ish lead: odd harmonics only.
      lead: mono(
        new Tone.Synth({
          volume: -16,
          portamento: 0.015,
          oscillator: { type: 'custom', partials: [1, 0, 0.36, 0, 0.18, 0, 0.1, 0, 0.05] },
          envelope: { attack: 0.05, decay: 0.25, sustain: 0.75, release: 0.35 },
        }),
        new Tone.Vibrato(5.2, 0.08),
        new Tone.Filter(2600, 'lowpass'),
        echo,
      ),
      // Tubular bells: an inharmonic FM ratio with a long ring.
      bells: poly(
        new Tone.PolySynth(Tone.FMSynth, {
          volume: -4,
          harmonicity: 1.4,
          modulationIndex: 10,
          oscillator: { type: 'sine' },
          modulation: { type: 'sine' },
          envelope: { attack: 0.002, decay: 4, sustain: 0, release: 3 },
          modulationEnvelope: { attack: 0.002, decay: 3, sustain: 0, release: 2 },
        }),
      ),
      timpani: mono(
        new Tone.MembraneSynth({
          volume: -12,
          pitchDecay: 0.06,
          octaves: 1.4,
          envelope: { attack: 0.002, decay: 1.1, sustain: 0, release: 0.6 },
        }),
      ),
      // Rattling bones.
      clack: mono(
        new Tone.MembraneSynth({
          volume: -14,
          pitchDecay: 0.006,
          octaves: 2.5,
          envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.04 },
        }),
      ),
      // Wordless "ooh" choir.
      choir: poly(
        new Tone.PolySynth(Tone.Synth, {
          volume: -16,
          oscillator: { type: 'fattriangle', count: 3, spread: 24 },
          envelope: { attack: 0.8, decay: 0.4, sustain: 0.8, release: 1.6 },
        }),
        new Tone.Filter({ type: 'bandpass', frequency: 900, Q: 0.7 }),
        new Tone.Chorus(0.3, 4, 0.5).start(),
      ),
      box: poly(
        new Tone.PolySynth(Tone.FMSynth, {
          volume: 0,
          harmonicity: 4,
          modulationIndex: 2.5,
          oscillator: { type: 'sine' },
          modulation: { type: 'sine' },
          envelope: { attack: 0.001, decay: 1.4, sustain: 0, release: 1.2 },
          modulationEnvelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.1 },
        }),
      ),
    };
  }
}

interface Mono extends Tone.ToneAudioNode {
  triggerAttackRelease(note: string, duration: number, time: number, velocity: number): unknown;
}

/** Beats to Transport ticks, which stay exact when the tempo moves. */
function ticks(beats: number): string {
  return `${Math.round(beats * Tone.getTransport().PPQ)}i`;
}
