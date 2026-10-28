import { midi } from './score';
import { hz, Sound } from './synth';

/**
 * Every sound effect as a synthesis recipe (PLAN.md §7). Punchy and loud like
 * a horde survivor, with an old-sampler crunch and a haunted streak: bone
 * rattles, slime bloops, a werewolf howl, bells and gongs in the waltz's D minor.
 *
 * Recipes run once, offline, into buffers; `sfx.ts` plays and rate-limits them.
 */
export interface SfxDef {
  /** Takes rendered with different seeds; each play picks one at random. */
  readonly variants: number;
  /** Most copies of this sound playing at once. */
  readonly voices: number;
  /** Fewest seconds between two starts. */
  readonly gap: number;
  /** Random pitch spread per play, ± semitones. */
  readonly jitter: number;
  /** Loudness: RMS of the loudest 30 ms, in dBFS. */
  readonly level: number;
  /** 2 always plays; 0 is the first to go when the mix is crowded. */
  readonly priority: 0 | 1 | 2;
  /** Render length before the silent tail is trimmed (reverb adds its own room). */
  readonly seconds: number;
  readonly render: (s: Sound) => void;
}

type Recipe = Partial<Omit<SfxDef, 'render' | 'seconds' | 'level'>> &
  Pick<SfxDef, 'render' | 'seconds' | 'level'>;

function sfx(recipe: Recipe): SfxDef {
  return { variants: 3, voices: 3, gap: 0.04, jitter: 1, priority: 1, ...recipe };
}

const note = (name: string) => hz(midi(name));

/** A struck metal bar: bright, sweet, short. */
function bell(s: Sound, freq: number, at: number, decay: number, gain = 1): Sound {
  const partials: readonly (readonly [number, number, number])[] = [
    [1, 1, 1],
    [2.76, 0.45, 0.6],
    [5.4, 0.22, 0.35],
    [8.93, 0.1, 0.2],
  ];
  for (const [ratio, level, length] of partials) {
    s.tone({ wave: 'sine', freq: freq * ratio, at, decay: decay * length, gain: gain * level });
  }
  return s;
}

/** A dark tolling bell or gong: FM with a fading index. */
function gong(s: Sound, freq: number, at: number, decay: number, gain = 1): Sound {
  return s.tone({ wave: 'sine', freq, at, decay, gain, fm: { ratio: 1.41, index: [11, 0.8] } });
}

/** A quick little chime figure, one plucked note after another. */
function arp(s: Sound, notes: readonly string[], step: number, at = 0, gain = 0.8): Sound {
  notes.forEach((name, i) =>
    s.pluck({ freq: note(name), at: at + i * step, decay: 0.35, bright: 0.85, gain }),
  );
  return s;
}

/** Brief random high glints. */
function sparkle(s: Sound, count: number, from: number, to: number, gain = 0.12): Sound {
  for (let i = 0; i < count; i++) {
    s.tone({ wave: 'sine', freq: s.rand(2200, 5200), at: s.rand(from, to), decay: 0.12, gain });
  }
  return s;
}

/** A short woody tick, the base of most UI sounds. */
function tick(s: Sound, freq: number, at = 0, gain = 1): Sound {
  return s
    .noise({ at, decay: 0.018, gain, filter: { type: 'bandpass', freq: freq * 2, q: 4 } })
    .tone({ wave: 'triangle', freq: [freq * 1.3, freq * 0.9], at, decay: 0.025, gain: gain * 0.5 });
}

/** Coin-on-coin chink. */
function chink(s: Sound, at: number, gain = 1): Sound {
  return s.metal({ freq: s.rand(780, 900), at, decay: 0.07, gain, cutoff: 5000 });
}

export const SFX = {
  // ── Weapons ────────────────────────────────────────────────────────────
  swingScimitar: sfx({
    seconds: 0.35,
    level: -21,
    render: (s) => {
      const r = s.rand(0.94, 1.06);
      s.noise({
        attack: 0.03,
        decay: 0.16,
        filter: { type: 'bandpass', freq: [3800 * r, 900 * r], q: 1.3 },
      })
        .noise({ attack: 0.01, decay: 0.05, gain: 0.25, filter: { type: 'highpass', freq: 6500 } })
        .tone({ wave: 'sine', freq: 2350 * r, at: 0.015, decay: 0.24, gain: 0.1 })
        .tone({ wave: 'sine', freq: 3610 * r, at: 0.015, decay: 0.18, gain: 0.07 })
        .tone({ wave: 'sine', freq: 5130 * r, at: 0.015, decay: 0.12, gain: 0.05 });
    },
  }),
  swingDagger: sfx({
    seconds: 0.15,
    level: -24,
    jitter: 2,
    render: (s) => {
      s.noise({
        attack: 0.008,
        decay: 0.07,
        filter: { type: 'bandpass', freq: [6000, 2600], q: 2 },
      }).tone({
        wave: 'sine',
        freq: s.rand(4000, 4500),
        at: 0.01,
        decay: 0.05,
        gain: 0.08,
      });
    },
  }),
  shootBow: sfx({
    seconds: 0.45,
    level: -21,
    render: (s) => {
      s.pluck({ freq: s.rand(140, 165), decay: 0.3, bright: 0.6 })
        .tone({ wave: 'sine', freq: [420, 120], glide: 0.02, decay: 0.06, gain: 0.5 })
        .noise({
          at: 0.01,
          attack: 0.01,
          decay: 0.08,
          gain: 0.35,
          filter: { type: 'bandpass', freq: [2500, 7000], q: 1 },
        });
    },
  }),
  castStaff: sfx({
    seconds: 0.75,
    level: -21,
    voices: 2,
    gap: 0.08,
    render: (s) => {
      const r = s.rand(0.97, 1.03);
      s.tone({
        wave: 'sine',
        freq: [note('D5') * r, note('D6') * r],
        attack: 0.02,
        decay: 0.28,
        gain: 0.55,
        vibrato: [11, 0.3],
        fm: { ratio: 1.5, index: [5, 0.4] },
      })
        .noise({
          attack: 0.06,
          decay: 0.2,
          gain: 0.5,
          filter: { type: 'bandpass', freq: [1200, 5000], q: 3 },
        })
        .reverb(0.3, 0.5);
    },
  }),
  throwBoomchin: sfx({
    seconds: 0.3,
    level: -21,
    voices: 2,
    gap: 0.1,
    jitter: 2,
    render: (s) => {
      const r = s.rand(0.92, 1.08);
      const squeak = { type: 'lowpass', freq: 4500 } as const;
      s.tone({
        wave: 'triangle',
        freq: [1500 * r, 2500 * r],
        attack: 0.005,
        decay: 0.07,
        gain: 0.6,
        filter: squeak,
      })
        .tone({
          wave: 'triangle',
          freq: [1900 * r, 3000 * r, 2400 * r],
          at: 0.08,
          attack: 0.005,
          decay: 0.09,
          gain: 0.5,
          filter: squeak,
        })
        .noise({
          attack: 0.05,
          decay: 0.14,
          gain: 0.35,
          filter: { type: 'bandpass', freq: [700, 2200], q: 1 },
        });
    },
  }),
  burstStaff: sfx({
    seconds: 0.8,
    level: -18,
    jitter: 1.5,
    gap: 0.06,
    render: (s) => {
      s.noise({ decay: 0.35, filter: { type: 'lowpass', freq: [4500, 350] } }).tone({
        wave: 'sine',
        freq: [190, 55],
        glide: 0.05,
        decay: 0.25,
        gain: 0.8,
      });
      const glints = ['D6', 'F6', 'A6', 'C7', 'D7'];
      for (let i = 0; i < 4; i++) {
        const name = glints[Math.floor(s.rand(0, glints.length))]!;
        s.tone({ wave: 'sine', freq: note(name), at: s.rand(0.01, 0.12), decay: 0.25, gain: 0.12 });
      }
      s.reverb(0.25, 0.5);
    },
  }),
  boomBoomchin: sfx({
    seconds: 1.1,
    level: -14,
    jitter: 1.5,
    gap: 0.08,
    render: (s) => {
      // The critter's last "eep!", then the bang.
      s.tone({ wave: 'triangle', freq: [2600, 3400], decay: 0.04, gain: 0.3 })
        .tone({ wave: 'sine', freq: [110, 38], glide: 0.07, at: 0.03, decay: 0.55 })
        .noise({ at: 0.03, decay: 0.6, gain: 0.9, filter: { type: 'lowpass', freq: [6000, 150] } })
        .noise({
          at: 0.03,
          decay: 0.12,
          gain: 0.5,
          filter: { type: 'bandpass', freq: 900, q: 0.8 },
        })
        .drive(3)
        .crush(7)
        .reverb(0.15, 0.6);
    },
  }),

  // ── Impacts ────────────────────────────────────────────────────────────
  hitBlade: sfx({
    seconds: 0.15,
    level: -19,
    variants: 4,
    voices: 5,
    gap: 0.03,
    jitter: 2,
    render: (s) => {
      s.tone({ wave: 'sine', freq: [s.rand(240, 290), 80], glide: 0.018, decay: 0.09 })
        .noise({
          decay: 0.05,
          gain: 0.8,
          filter: { type: 'bandpass', freq: [s.rand(2400, 3000), 700], q: 1.4 },
        })
        .noise({ decay: 0.012, gain: 0.35, filter: { type: 'highpass', freq: 4500 } })
        .drive(2.5)
        .crush(8);
    },
  }),
  hitArrow: sfx({
    seconds: 0.13,
    level: -20,
    voices: 4,
    gap: 0.035,
    jitter: 2,
    render: (s) => {
      s.tone({
        wave: 'triangle',
        freq: [s.rand(480, 560), 150],
        glide: 0.015,
        decay: 0.07,
        gain: 0.8,
      })
        .noise({
          decay: 0.045,
          gain: 0.6,
          filter: { type: 'bandpass', freq: s.rand(1000, 1300), q: 5 },
        })
        .noise({ decay: 0.01, gain: 0.3, filter: { type: 'highpass', freq: 5000 } })
        .drive(2);
    },
  }),
  crit: sfx({
    seconds: 0.4,
    level: -17,
    voices: 2,
    gap: 0.06,
    render: (s) => {
      const r = s.rand(0.98, 1.02);
      s.tone({ wave: 'sine', freq: [320, 60], glide: 0.03, decay: 0.16 })
        .noise({ decay: 0.09, gain: 0.9, filter: { type: 'bandpass', freq: [3200, 500], q: 1.2 } })
        .drive(3)
        .crush(8)
        .tone({ wave: 'sine', freq: note('A6') * r, at: 0.004, decay: 0.32, gain: 0.22 })
        .tone({ wave: 'sine', freq: note('E7') * r, at: 0.004, decay: 0.22, gain: 0.14 });
    },
  }),

  // ── Enemy deaths ───────────────────────────────────────────────────────
  dieZombie: sfx({
    seconds: 0.4,
    level: -21,
    gap: 0.05,
    jitter: 2,
    render: (s) => {
      const freq = [s.rand(140, 160), s.rand(85, 100)];
      const groan = { attack: 0.02, decay: 0.28, vibrato: [7, 0.4] } as const;
      s.tone({
        wave: 'saw',
        freq,
        ...groan,
        gain: 0.8,
        filter: { type: 'bandpass', freq: 650, q: 2 },
      })
        .tone({
          wave: 'saw',
          freq,
          ...groan,
          gain: 0.4,
          filter: { type: 'bandpass', freq: 1100, q: 3 },
        })
        .noise({ decay: 0.12, gain: 0.6, filter: { type: 'lowpass', freq: [1800, 300] } })
        .drive(1.5);
    },
  }),
  dieHand: sfx({
    seconds: 0.2,
    level: -22,
    gap: 0.05,
    jitter: 2,
    render: (s) => {
      // Knuckle bones clattering apart.
      const pitch = s.rand(2400, 3200);
      [0, 0.035, 0.06, 0.1].forEach((at, i) =>
        s.noise({
          at: at + s.rand(0, 0.01),
          decay: 0.025,
          gain: 1 - i * 0.22,
          filter: { type: 'bandpass', freq: pitch * s.rand(0.85, 1.15), q: 5 },
        }),
      );
      s.tone({ wave: 'triangle', freq: [900, 700], decay: 0.04, gain: 0.4 });
    },
  }),
  dieSlime: sfx({
    seconds: 0.32,
    level: -20,
    gap: 0.05,
    jitter: 2,
    render: (s) => {
      // Splat, then bubbles that rise as they pop.
      s.noise({ decay: 0.18, gain: 0.8, filter: { type: 'lowpass', freq: [2500, 250], q: 1.5 } })
        .tone({ wave: 'sine', freq: [300, 900], at: 0.02, attack: 0.005, decay: 0.12, gain: 0.7 })
        .tone({
          wave: 'sine',
          freq: [500, 1300],
          at: s.rand(0.06, 0.09),
          attack: 0.005,
          decay: 0.08,
          gain: 0.4,
        });
    },
  }),
  dieSlimeSmall: sfx({
    seconds: 0.13,
    level: -23,
    gap: 0.04,
    jitter: 2,
    render: (s) => {
      s.tone({ wave: 'sine', freq: [s.rand(550, 650), 1600], attack: 0.004, decay: 0.07 }).noise({
        decay: 0.05,
        gain: 0.4,
        filter: { type: 'lowpass', freq: 3000 },
      });
    },
  }),
  dieWerewolf: sfx({
    seconds: 1.1,
    level: -17,
    variants: 2,
    voices: 2,
    gap: 0.15,
    render: (s) => {
      const freq = [s.rand(850, 950), 260];
      const yelp = { attack: 0.02, hold: 0.05, decay: 0.5, vibrato: [6, 0.5] } as const;
      s.tone({
        wave: 'saw',
        freq,
        ...yelp,
        gain: 0.8,
        filter: { type: 'bandpass', freq: 1000, q: 2 },
      })
        .tone({
          wave: 'saw',
          freq,
          ...yelp,
          gain: 0.3,
          filter: { type: 'bandpass', freq: 2200, q: 4 },
        })
        .tone({ wave: 'sine', freq: [120, 50], glide: 0.06, decay: 0.25, gain: 0.6 })
        .drive(2)
        .reverb(0.2, 0.7);
    },
  }),
  dieElite: sfx({
    seconds: 2.4,
    level: -15,
    variants: 2,
    voices: 2,
    gap: 0.15,
    jitter: 0.5,
    priority: 2,
    render: (s) => {
      gong(s, note('D3'), 0, 1.6, 0.7);
      s.tone({ wave: 'sine', freq: [90, 35], glide: 0.08, decay: 0.5 })
        .noise({ decay: 0.5, gain: 0.6, filter: { type: 'lowpass', freq: [3000, 100] } })
        .drive(1.5)
        .reverb(0.3, 0.8);
    },
  }),

  // ── Werewolf ───────────────────────────────────────────────────────────
  howl: sfx({
    seconds: 2.8,
    level: -16,
    variants: 2,
    voices: 1,
    gap: 0.8,
    priority: 2,
    render: (s) => {
      const r = s.rand(0.96, 1.04);
      const freq = [330, 600, 620, 580, 430].map((f) => f * r);
      const shape = { attack: 0.18, hold: 0.55, decay: 0.7, vibrato: [5.5, 0.3] } as const;
      // "Aaa-ooo": the first formant closes as the howl falls.
      s.tone({
        wave: 'saw',
        freq,
        ...shape,
        filter: { type: 'bandpass', freq: [650, 900, 500], q: 2.5 },
      })
        .tone({
          wave: 'saw',
          freq,
          ...shape,
          gain: 0.35,
          filter: { type: 'bandpass', freq: 1900, q: 5 },
        })
        .tone({ wave: 'sine', freq, ...shape, gain: 0.4 })
        .drive(1.5)
        .reverb(0.4, 0.9);
    },
  }),
  snarl: sfx({
    seconds: 0.6,
    level: -18,
    variants: 2,
    voices: 2,
    gap: 0.2,
    priority: 2,
    render: (s) => {
      const r = s.rand(0.95, 1.05);
      const growl = { attack: 0.04, hold: 0.25, decay: 0.2, tremolo: [26, 0.75] } as const;
      s.tone({
        wave: 'saw',
        freq: [80 * r, 95 * r, 75 * r],
        ...growl,
        filter: { type: 'lowpass', freq: 900, q: 2 },
      })
        .noise({ ...growl, gain: 0.35, filter: { type: 'bandpass', freq: 450, q: 1.2 } })
        .drive(3);
    },
  }),
  lunge: sfx({
    seconds: 0.3,
    level: -19,
    variants: 2,
    voices: 2,
    gap: 0.12,
    render: (s) => {
      // Rush of air, then the jaws snap shut.
      s.noise({
        attack: 0.06,
        decay: 0.12,
        filter: { type: 'bandpass', freq: [500, 3200], q: 1.2 },
      })
        .noise({ at: 0.1, decay: 0.02, gain: 0.4, filter: { type: 'highpass', freq: 3000 } })
        .tone({ wave: 'sine', freq: [800, 300], at: 0.1, decay: 0.04, gain: 0.5 });
    },
  }),

  // ── Bob ────────────────────────────────────────────────────────────────
  hurt: sfx({
    seconds: 0.3,
    level: -15,
    voices: 1,
    gap: 0.1,
    priority: 2,
    render: (s) => {
      const r = s.rand(0.95, 1.05);
      // Thud, then Bob's grunt (two vowel formants).
      s.tone({ wave: 'sine', freq: [210, 55], glide: 0.04, decay: 0.2 })
        .noise({ decay: 0.1, gain: 0.7, filter: { type: 'bandpass', freq: [1600, 400], q: 1.2 } })
        .tone({
          wave: 'saw',
          freq: [200 * r, 140 * r],
          attack: 0.01,
          decay: 0.16,
          gain: 0.55,
          filter: { type: 'bandpass', freq: 650, q: 3 },
        })
        .tone({
          wave: 'saw',
          freq: [200 * r, 140 * r],
          attack: 0.01,
          decay: 0.16,
          gain: 0.3,
          filter: { type: 'bandpass', freq: 1200, q: 4 },
        })
        .drive(3)
        .crush(6);
    },
  }),
  dodge: sfx({
    seconds: 0.18,
    level: -24,
    variants: 2,
    voices: 1,
    gap: 0.1,
    jitter: 2,
    render: (s) => {
      s.noise({
        attack: 0.04,
        decay: 0.08,
        filter: { type: 'bandpass', freq: [1800, 6500], q: 1.5 },
      }).tone({
        wave: 'sine',
        freq: [900, 1500],
        decay: 0.06,
        gain: 0.2,
      });
    },
  }),
  death: sfx({
    seconds: 3.2,
    level: -14,
    variants: 1,
    voices: 1,
    gap: 1,
    jitter: 0,
    priority: 2,
    render: (s) => {
      s.tone({ wave: 'sine', freq: [180, 40], glide: 0.06, decay: 0.4 })
        .noise({ decay: 0.25, gain: 0.8, filter: { type: 'lowpass', freq: [2500, 150] } })
        .drive(2.5);
      gong(s, note('D2'), 0.05, 2.2, 0.6);
      // The soul leaves, wailing downwards.
      const wail = { at: 0.2, attack: 0.15, hold: 0.3, decay: 1.2, vibrato: [5, 0.5] } as const;
      s.tone({ wave: 'sine', freq: [880, 700, 440, 220], ...wail, gain: 0.45 })
        .tone({ wave: 'triangle', freq: [1320, 1050, 660, 330], ...wail, gain: 0.12 })
        .reverb(0.4, 1);
    },
  }),

  // ── Pickups ────────────────────────────────────────────────────────────
  coin: sfx({
    seconds: 0.35,
    level: -22,
    variants: 2,
    voices: 4,
    gap: 0.025,
    jitter: 0,
    priority: 0,
    render: (s) => {
      // Pitched as D6; `sfx.ts` walks it up the scale during a pickup streak.
      const f = note('D6');
      s.noise({ decay: 0.008, gain: 0.25, filter: { type: 'highpass', freq: 7000 } })
        .tone({ wave: 'sine', freq: [f * 1.06, f], glide: 0.01, decay: 0.3 })
        .tone({ wave: 'sine', freq: f * s.rand(2, 2.01), decay: 0.15, gain: 0.3 })
        .tone({ wave: 'sine', freq: f * 4.2, decay: 0.05, gain: 0.15 });
    },
  }),
  coinBig: sfx({
    seconds: 0.5,
    level: -21,
    variants: 2,
    voices: 3,
    gap: 0.03,
    jitter: 0,
    priority: 0,
    render: (s) => {
      chink(s, 0, 0.5);
      bell(s, note('D6'), 0, 0.3, 0.8);
      bell(s, note('A6'), 0.045, 0.35, 0.7);
    },
  }),
  food: sfx({
    seconds: 0.9,
    level: -19,
    variants: 2,
    voices: 1,
    gap: 0.15,
    render: (s) => {
      // Chomp, chomp, then a little healing shimmer.
      s.noise({
        attack: 0.005,
        decay: 0.05,
        filter: { type: 'bandpass', freq: s.rand(1200, 1600), q: 1.2 },
      })
        .noise({
          at: 0.13,
          attack: 0.005,
          decay: 0.05,
          gain: 0.8,
          filter: { type: 'bandpass', freq: s.rand(1200, 1600), q: 1.2 },
        })
        .crush(6);
      ['D5', 'F5', 'A5', 'D6'].forEach((name, i) =>
        s.tone({ wave: 'sine', freq: note(name), at: 0.26 + i * 0.05, decay: 0.3, gain: 0.3 }),
      );
      s.reverb(0.25, 0.5);
    },
  }),
  levelUp: sfx({
    seconds: 1.5,
    level: -16,
    variants: 1,
    voices: 1,
    gap: 0.2,
    jitter: 0,
    priority: 2,
    render: (s) => {
      arp(s, ['D5', 'F5', 'A5', 'D6', 'F6'], 0.06);
      bell(s, note('D6'), 0.24, 1, 0.6);
      sparkle(s, 8, 0.2, 0.7, 0.1);
      s.reverb(0.3, 0.7);
    },
  }),

  // ── Waves ──────────────────────────────────────────────────────────────
  waveStart: sfx({
    seconds: 3.2,
    level: -15,
    variants: 1,
    voices: 1,
    gap: 1,
    jitter: 0,
    priority: 2,
    render: (s) => {
      // A gong and a hunting horn calling D up to A.
      gong(s, note('D2'), 0, 2.5, 0.8);
      const horn = {
        wave: 'saw',
        vibrato: [4.5, 0.08],
        filter: { type: 'lowpass', freq: [500, 1400, 900], q: 1.5 },
      } as const;
      s.tone({
        ...horn,
        freq: note('D3'),
        at: 0.05,
        attack: 0.12,
        hold: 0.3,
        decay: 0.4,
        gain: 0.35,
      })
        .tone({
          ...horn,
          freq: note('A3'),
          at: 0.6,
          attack: 0.1,
          hold: 0.45,
          decay: 0.8,
          gain: 0.4,
        })
        .reverb(0.35, 1);
    },
  }),
  waveEnd: sfx({
    seconds: 2.2,
    level: -16,
    variants: 1,
    voices: 1,
    gap: 1,
    jitter: 0,
    priority: 2,
    render: (s) => {
      // Bells, and the ghosts of the cleared horde rushing off.
      s.noise({
        attack: 0.3,
        decay: 0.5,
        gain: 0.3,
        filter: { type: 'bandpass', freq: [400, 2500], q: 2 },
      });
      bell(s, note('D5'), 0, 0.9);
      bell(s, note('A5'), 0.12, 0.9);
      bell(s, note('D6'), 0.24, 1.2);
      s.reverb(0.35, 0.8);
    },
  }),
  victory: sfx({
    seconds: 2.6,
    level: -17,
    variants: 1,
    voices: 1,
    gap: 1,
    jitter: 0,
    priority: 2,
    render: (s) => {
      ['D5', 'F#5', 'A5', 'D6'].forEach((name, i) => bell(s, note(name), i * 0.1, 1.4, 0.8));
      sparkle(s, 10, 0.3, 1, 0.08);
      s.reverb(0.35, 0.9);
    },
  }),

  // ── Menus ──────────────────────────────────────────────────────────────
  click: sfx({
    seconds: 0.06,
    level: -24,
    variants: 2,
    voices: 2,
    gap: 0.03,
    render: (s) => void tick(s, s.rand(1100, 1300)),
  }),
  select: sfx({
    seconds: 0.35,
    level: -22,
    variants: 2,
    voices: 2,
    gap: 0.03,
    jitter: 0,
    render: (s) => {
      tick(s, 1000, 0, 0.6);
      s.pluck({ freq: note('D5'), decay: 0.25, bright: 0.7, gain: 0.6 });
    },
  }),
  start: sfx({
    seconds: 2,
    level: -16,
    variants: 1,
    voices: 1,
    gap: 0.5,
    jitter: 0,
    priority: 2,
    render: (s) => {
      // A blade drawn from its sheath, then a gong.
      s.noise({
        attack: 0.05,
        hold: 0.1,
        decay: 0.15,
        gain: 0.5,
        filter: { type: 'bandpass', freq: [2000, 6000], q: 2 },
      });
      for (const [f, g] of [
        [2350, 0.25],
        [3610, 0.15],
        [5130, 0.1],
      ] as const) {
        s.tone({ wave: 'sine', freq: f, at: 0.12, attack: 0.02, decay: 0.6, gain: g });
      }
      gong(s, note('D2'), 0.08, 1.5, 0.4);
      s.reverb(0.3, 0.8);
    },
  }),
  buy: sfx({
    seconds: 0.55,
    level: -19,
    variants: 2,
    voices: 2,
    gap: 0.05,
    jitter: 0,
    render: (s) => {
      chink(s, 0);
      chink(s, 0.05, 0.8);
      chink(s, 0.1, 0.6);
      bell(s, note('A6'), 0.1, 0.35, 0.7);
    },
  }),
  sell: sfx({
    seconds: 0.5,
    level: -20,
    variants: 1,
    voices: 1,
    gap: 0.05,
    jitter: 0,
    render: (s) => {
      chink(s, 0, 0.6);
      chink(s, 0.06, 0.8);
      bell(s, note('D6'), 0.04, 0.25, 0.6);
      bell(s, note('A5'), 0.12, 0.3, 0.6);
    },
  }),
  reroll: sfx({
    seconds: 0.45,
    level: -22,
    variants: 2,
    voices: 1,
    gap: 0.1,
    jitter: 0,
    render: (s) => {
      // Bone dice rattling in a cup, then settling.
      for (let i = 0; i < 6; i++) tick(s, s.rand(900, 1600), s.rand(0, 0.25), s.rand(0.5, 1));
      tick(s, 800, 0.3, 0.9);
    },
  }),
  lock: sfx({
    seconds: 0.15,
    level: -21,
    variants: 1,
    voices: 1,
    gap: 0.05,
    jitter: 0,
    render: (s) => {
      s.noise({ decay: 0.015, filter: { type: 'bandpass', freq: 3000, q: 5 } })
        .tone({ wave: 'triangle', freq: [700, 500], at: 0.055, decay: 0.04, gain: 0.7 })
        .noise({ at: 0.055, decay: 0.03, filter: { type: 'bandpass', freq: 1500, q: 4 } });
    },
  }),
  unlock: sfx({
    seconds: 0.15,
    level: -22,
    variants: 1,
    voices: 1,
    gap: 0.05,
    jitter: 0,
    render: (s) => {
      s.tone({ wave: 'triangle', freq: [600, 800], decay: 0.04, gain: 0.7 })
        .noise({ decay: 0.03, filter: { type: 'bandpass', freq: 1500, q: 4 } })
        .noise({ at: 0.06, decay: 0.015, filter: { type: 'bandpass', freq: 3400, q: 5 } });
    },
  }),
  error: sfx({
    seconds: 0.35,
    level: -19,
    variants: 1,
    voices: 1,
    gap: 0.1,
    jitter: 0,
    render: (s) => {
      const thud = { wave: 'square', decay: 0.13, filter: { type: 'lowpass', freq: 700 } } as const;
      s.tone({ ...thud, freq: [150, 115] }).tone({ ...thud, freq: [125, 95], at: 0.1 });
    },
  }),
  pause: sfx({
    seconds: 0.45,
    level: -22,
    variants: 1,
    voices: 1,
    gap: 0.1,
    jitter: 0,
    render: (s) => {
      s.pluck({ freq: note('A4'), decay: 0.3, bright: 0.4 }).pluck({
        freq: note('D4'),
        at: 0.08,
        decay: 0.35,
        bright: 0.4,
      });
    },
  }),
  resume: sfx({
    seconds: 0.45,
    level: -22,
    variants: 1,
    voices: 1,
    gap: 0.1,
    jitter: 0,
    render: (s) => {
      s.pluck({ freq: note('D4'), decay: 0.3, bright: 0.4 }).pluck({
        freq: note('A4'),
        at: 0.08,
        decay: 0.35,
        bright: 0.4,
      });
    },
  }),
  pick1: sfx({
    seconds: 0.6,
    level: -19,
    variants: 1,
    voices: 1,
    gap: 0.1,
    jitter: 0,
    render: (s) => void arp(s, ['D5', 'A5'], 0.07).reverb(0.2, 0.5),
  }),
  pick2: sfx({
    seconds: 0.7,
    level: -18,
    variants: 1,
    voices: 1,
    gap: 0.1,
    jitter: 0,
    render: (s) => void arp(s, ['D5', 'F5', 'A5'], 0.06).reverb(0.25, 0.5),
  }),
  pick3: sfx({
    seconds: 1.2,
    level: -17,
    variants: 1,
    voices: 1,
    gap: 0.1,
    jitter: 0,
    render: (s) => {
      arp(s, ['D5', 'F5', 'A5', 'D6'], 0.055);
      bell(s, note('D6'), 0.165, 0.8, 0.5);
      s.reverb(0.3, 0.6);
    },
  }),
  pick4: sfx({
    seconds: 1.8,
    level: -16,
    variants: 1,
    voices: 1,
    gap: 0.1,
    jitter: 0,
    render: (s) => {
      s.noise({
        attack: 0.2,
        decay: 0.3,
        gain: 0.25,
        filter: { type: 'bandpass', freq: [600, 4000], q: 2 },
      });
      arp(s, ['D5', 'F5', 'A5', 'D6', 'F6', 'A6'], 0.05);
      bell(s, note('D6'), 0.25, 1.2, 0.6);
      bell(s, note('A6'), 0.3, 1, 0.4);
      sparkle(s, 12, 0.25, 0.9, 0.1);
      s.reverb(0.4, 0.8);
    },
  }),
} satisfies Record<string, SfxDef>;

export type SfxId = keyof typeof SFX;
export const SFX_IDS = Object.keys(SFX) as readonly SfxId[];

export type UiSound = Extract<
  SfxId,
  | 'click'
  | 'select'
  | 'start'
  | 'buy'
  | 'sell'
  | 'reroll'
  | 'lock'
  | 'unlock'
  | 'error'
  | 'pause'
  | 'resume'
  | 'pick1'
  | 'pick2'
  | 'pick3'
  | 'pick4'
>;

/** Renders every take of one sound. Pure and deterministic, so it runs anywhere. */
export function renderSfx(id: SfxId): Float32Array<ArrayBuffer>[] {
  const def = SFX[id];
  return Array.from({ length: def.variants }, (_, take) => {
    const s = new Sound(def.seconds, seedOf(id, take));
    def.render(s);
    return s.finish(def.level);
  });
}

function seedOf(id: string, take: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return (h ^ Math.imul(take + 1, 0x9e3779b1)) >>> 0;
}
