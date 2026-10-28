/**
 * "Wolfmoor Waltz": an original spooky waltz in D minor, 3/4, 32 bars in four
 * 8-bar sections (A, A', B, C). The style aims for old browser-MMO MIDI: a
 * pizzicato bass, harpsichord, church organ, tubular bells and timpani.
 *
 * Pure data with no Tone.js import, so any music engine can play it and the
 * tests can check it. Times and lengths are in beats (quarter notes).
 */

export const BEATS_PER_BAR = 3;

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const VOICE_IDS = [
  'bass',
  'organ',
  'waltz',
  'arp',
  'lead',
  'bells',
  'timpani',
  'clack',
  'choir',
  'box',
] as const;
export type VoiceId = (typeof VOICE_IDS)[number];

export interface NoteEvent {
  /** Start, in beats from the top of the song or sting. */
  beat: number;
  notes: string[];
  beats: number;
  velocity: number;
}

export interface Song {
  bars: number;
  voices: Record<VoiceId, NoteEvent[]>;
}

export interface Sting {
  bpm: number;
  voices: Partial<Record<VoiceId, NoteEvent[]>>;
}

type ChordName = 'Dm' | 'Bb' | 'A' | 'A7' | 'Gm' | 'Eb' | 'F' | 'C';

interface Chord {
  bass: string;
  /** Close voicing around F4, ascending. */
  voicing: [string, string, string];
}

const CHORDS: Record<ChordName, Chord> = {
  Dm: { bass: 'D2', voicing: ['D4', 'F4', 'A4'] },
  Bb: { bass: 'Bb1', voicing: ['D4', 'F4', 'Bb4'] },
  A: { bass: 'A1', voicing: ['C#4', 'E4', 'A4'] },
  A7: { bass: 'A1', voicing: ['C#4', 'E4', 'G4'] },
  Gm: { bass: 'G1', voicing: ['D4', 'G4', 'Bb4'] },
  Eb: { bass: 'Eb2', voicing: ['Eb4', 'G4', 'Bb4'] },
  F: { bass: 'F2', voicing: ['C4', 'F4', 'A4'] },
  C: { bass: 'C2', voicing: ['C4', 'E4', 'G4'] },
};

/** One chord per bar. The Eb is the flat-two that makes it sound haunted. */
// prettier-ignore
const PROGRESSION: ChordName[] = [
  // A
  'Dm', 'Dm', 'Bb', 'A', 'Gm', 'Dm', 'Eb', 'A',
  // A'
  'Dm', 'Dm', 'Bb', 'A', 'Gm', 'Eb', 'A', 'Dm',
  // B: brief relief in the relative major
  'F', 'C', 'Dm', 'A', 'Bb', 'F', 'Gm', 'A',
  // C: creeping, low, back to the dominant
  'Dm', 'Eb', 'Dm', 'Eb', 'Bb', 'Gm', 'A', 'A7',
];

/** `note:beats`, `-:beats` for a rest, `|` between bars. */
const LEAD = [
  // A
  'A4:2 D5:1 | F5:1.5 E5:.5 D5:1 | F5:1 D5:1 Bb4:1 | E5:2 C#5:1',
  'D5:2 Bb4:1 | A4:1.5 G4:.5 F4:1 | G4:1 Bb4:1 Eb5:1 | C#5:3',
  // A'
  'A4:2 D5:1 | F5:1.5 G5:.5 A5:1 | Bb5:2 F5:1 | E5:2 C#5:1',
  'D5:1 Bb4:1 G4:1 | Eb5:2 Bb4:1 | C#5:2 E5:1 | D5:3',
  // B
  'C5:2 F5:1 | E5:1.5 D5:.5 C5:1 | D5:2 F5:1 | E5:3',
  'F5:1 E5:1 D5:1 | C5:2 A4:1 | Bb4:1 A4:1 G4:1 | A4:3',
  // C
  'D4:1 F4:1 A4:1 | Bb4:2 G4:1 | A4:1 F4:1 D4:1 | Eb4:3',
  'D4:1 F4:1 Bb4:1 | D5:2 Bb4:1 | C#5:2 E5:1 | G5:1 E5:1 C#5:1',
].join(' | ');

/** Tolls on the downbeat of these bars (0-based). Section C tolls every bar. */
const BELLS: [bar: number, note: string][] = [
  [0, 'D4'],
  [4, 'G3'],
  [8, 'D4'],
  [12, 'G3'],
  [16, 'F3'],
  [20, 'Bb3'],
  [24, 'D4'],
  [25, 'Eb4'],
  [26, 'D4'],
  [27, 'Eb4'],
  [28, 'Bb3'],
  [30, 'A3'],
  [31, 'A3'],
];

export const SONG: Song = buildSong();

export const STINGS: Record<'victory' | 'defeat', Sting> = {
  // Dawn breaks: the tonic turns major.
  victory: {
    bpm: 96,
    voices: {
      arp: line(0, 'D4:.25 F#4:.25 A4:.25 D5:.25'),
      lead: line(0, '-:1 D5:.5 F#5:.5 A5:4'),
      organ: [ev(0, ['D3', 'A3', 'F#4'], 6, 0.7)],
      bells: [ev(2, ['D4', 'A4'], 4, 0.9)],
      timpani: [ev(0, ['D2'], 1, 0.6), ev(2, ['D2'], 1, 0.9)],
    },
  },
  defeat: {
    bpm: 66,
    voices: {
      organ: [ev(0, ['D3', 'A3', 'F4'], 7, 0.7)],
      lead: line(0, '-:1 A4:1 G4:1 F4:1 E4:1 D4:4'),
      bells: [ev(0, ['D3'], 4, 1), ev(4, ['D3'], 4, 0.8)],
      timpani: [ev(0, ['D2'], 2, 0.9), ev(4, ['A1'], 2, 0.6)],
    },
  },
};

function buildSong(): Song {
  const voices = Object.fromEntries(VOICE_IDS.map((id) => [id, [] as NoteEvent[]])) as Record<
    VoiceId,
    NoteEvent[]
  >;
  const lead = line(0, LEAD);
  if (lead.length === 0 || barOf(lead[lead.length - 1]!.beat) !== PROGRESSION.length - 1) {
    throw new Error('Lead line and chord progression have different lengths');
  }
  voices.lead = lead;

  PROGRESSION.forEach((name, bar) => {
    const { bass, voicing } = CHORDS[name];
    const [a, b, c] = voicing;
    const top = transpose(a, 12);
    const t = bar * BEATS_PER_BAR;
    const section = Math.floor(bar / 8);
    const phraseEnd = bar % 4 === 3;

    // Oom: bass on the downbeat, a soft fifth on beat three.
    voices.bass.push(ev(t, [bass], 1, 0.9), ev(t + 2, [transpose(bass, 7)], 1, 0.5));
    // Pah-pah: harpsichord stabs.
    voices.waltz.push(ev(t + 1, voicing, 0.5, 0.55), ev(t + 2, voicing, 0.5, 0.45));
    // Organ holds an open voicing for the whole bar.
    voices.organ.push(ev(t, [transpose(a, -12), transpose(c, -12), b], 3, 0.6));
    voices.choir.push(ev(t, [b, c, top], 3, 0.5));

    // Running eighths; section B turns the pattern over.
    const arp = section === 2 ? [c, b, a, b, c, top] : [a, b, c, top, c, b];
    arp.forEach((note, i) => voices.arp.push(ev(t + i * 0.5, [note], 0.5, i === 0 ? 0.7 : 0.5)));

    voices.timpani.push(ev(t, [bass], 1, 0.9));
    if (phraseEnd) {
      // A short roll into the next phrase, longer at section ends.
      const hits = bar % 8 === 7 ? 8 : 4;
      for (let i = 0; i < hits; i++) {
        voices.timpani.push(ev(t + 3 - (hits - i) * 0.25, [bass], 0.25, 0.3 + (0.5 * i) / hits));
      }
    }
    voices.clack.push(
      ev(t + 1, ['G4'], 0.25, 0.6),
      ev(t + 2, ['G4'], 0.25, 0.5),
      ev(t + 2.5, ['D5'], 0.25, 0.4),
    );

    // The shop's music box: a little dyad on the pah-pahs.
    voices.box.push(ev(t + 1, [transpose(b, 12), transpose(c, 12)], 1, 0.3));
  });

  // Music box carries the tune an octave up.
  for (const note of lead)
    voices.box.push({ ...note, notes: note.notes.map((n) => transpose(n, 12)), velocity: 0.6 });

  for (const [bar, note] of BELLS)
    voices.bells.push(ev(bar * BEATS_PER_BAR, [note], 3, bar >= 24 ? 0.7 : 0.9));

  for (const id of VOICE_IDS) voices[id].sort((x, y) => x.beat - y.beat);
  return { bars: PROGRESSION.length, voices };
}

/** Parses `note:beats` tokens. Throws if a bar doesn't add up, so typos fail loudly. */
export function line(start: number, text: string): NoteEvent[] {
  const events: NoteEvent[] = [];
  let beat = start;
  text.split('|').forEach((bar, index, bars) => {
    const barStart = beat;
    for (const token of bar.trim().split(/\s+/)) {
      const [note, length] = token.split(':');
      const beats = Number(length);
      if (!note || !(beats > 0)) throw new Error(`Bad note "${token}"`);
      if (note !== '-') {
        midi(note); // validates
        events.push(ev(beat, [note], beats, 0.8));
      }
      beat += beats;
    }
    if (bars.length > 1 && beat - barStart !== BEATS_PER_BAR) {
      throw new Error(`Bar ${index + 1} of "${text.slice(0, 24)}…" has ${beat - barStart} beats`);
    }
  });
  return events;
}

function ev(beat: number, notes: string[], beats: number, velocity: number): NoteEvent {
  return { beat, notes, beats, velocity };
}

function barOf(beat: number): number {
  return Math.floor(beat / BEATS_PER_BAR);
}

/** MIDI number of a note name like `C#4` or `Bb1`. */
export function midi(note: string): number {
  const match = /^([A-G])(#|b)?(-?\d)$/.exec(note);
  if (!match) throw new Error(`Bad note name "${note}"`);
  const [, letter, accidental, octave] = match;
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (Number(octave) + 1) * 12 + STEPS[letter!]! + shift;
}

export function transpose(note: string, semitones: number): string {
  const m = midi(note) + semitones;
  return `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
}
