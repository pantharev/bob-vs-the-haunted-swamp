import { VOICE_IDS, type VoiceId } from './score';

/**
 * What the game asks of a music engine (PLAN.md §7). The Tone.js engine
 * implements it today; a Strudel engine (or bounced loops) can slot in later.
 */
export interface MusicEngine {
  setScene(scene: MusicScene): void;
  /** 0 = calm, 1 = everything at once. Only the wave scene listens. */
  setIntensity(intensity: number): void;
  /** Quieter while the game is paused. */
  setDucked(ducked: boolean): void;
  /** Off stops scheduling altogether, so it costs no CPU. */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

export type MusicScene = 'title' | 'wave' | 'shop' | 'victory' | 'defeat';

export type Mix = Record<VoiceId, number>;

/** Layer levels (0..1) for a scene. Layers fade in as the wave heats up. */
export function layerMix(scene: MusicScene, intensity: number): Mix {
  const mix = Object.fromEntries(VOICE_IDS.map((id) => [id, 0])) as Mix;
  const x = Math.min(Math.max(intensity, 0), 1);
  switch (scene) {
    case 'title':
      return { ...mix, organ: 0.8, bass: 0.5, lead: 0.7, bells: 1, choir: 0.35, waltz: 0.25 };
    case 'shop':
      return { ...mix, box: 1, organ: 0.35, bass: 0.45 };
    case 'wave': {
      const arp = fade(x, 0.3, 0.45);
      return {
        ...mix,
        bass: 1,
        organ: 0.55,
        waltz: 1 - 0.5 * arp,
        arp,
        lead: 1,
        bells: 0.6,
        timpani: fade(x, 0.45, 0.6),
        clack: fade(x, 0.65, 0.8),
        choir: fade(x, 0.82, 0.95),
      };
    }
    case 'victory':
    case 'defeat':
      // Stings set their own levels.
      return mix;
  }
}

/** Beats per minute: the waltz leans forward as the wave gets busier. */
export function sceneTempo(scene: MusicScene, intensity: number): number {
  if (scene === 'title') return 80;
  if (scene === 'shop') return 74;
  return 86 + 10 * Math.min(Math.max(intensity, 0), 1);
}

function fade(x: number, from: number, to: number): number {
  return Math.min(Math.max((x - from) / (to - from), 0), 1);
}
