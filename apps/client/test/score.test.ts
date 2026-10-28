import { describe, expect, it } from 'vitest';
import { layerMix, sceneTempo } from '../src/audio/music';
import { BEATS_PER_BAR, line, midi, SONG, STINGS, transpose, VOICE_IDS } from '../src/audio/score';

describe('music score', () => {
  const length = SONG.bars * BEATS_PER_BAR;

  it('keeps every voice inside the loop', () => {
    for (const id of VOICE_IDS) {
      expect(SONG.voices[id].length, id).toBeGreaterThan(0);
      for (const note of SONG.voices[id]) {
        expect(note.beat, id).toBeGreaterThanOrEqual(0);
        expect(note.beat, id).toBeLessThan(length);
        expect(note.beats, id).toBeGreaterThan(0);
        expect(note.velocity, id).toBeGreaterThan(0);
        expect(note.velocity, id).toBeLessThanOrEqual(1);
        for (const name of note.notes) expect(() => midi(name), name).not.toThrow();
      }
    }
  });

  it('never stacks two notes at once on a monophonic voice', () => {
    for (const id of ['bass', 'lead', 'timpani', 'clack'] as const) {
      const starts = SONG.voices[id].map((n) => n.beat);
      expect(new Set(starts).size, id).toBe(starts.length);
      for (const sting of Object.values(STINGS)) {
        const beats = (sting.voices[id] ?? []).map((n) => n.beat);
        expect(new Set(beats).size, id).toBe(beats.length);
      }
    }
  });

  it('fills the lead line to exactly 32 bars of 3/4', () => {
    const lead = SONG.voices.lead;
    const last = lead[lead.length - 1]!;
    expect(last.beat + last.beats).toBe(length);
  });

  it('rejects a bar with the wrong length', () => {
    expect(() => line(0, 'D4:1 | D4:2')).toThrow(/Bar 1/);
    expect(() => line(0, 'H4:3')).toThrow(/note name/);
  });

  it('transposes note names', () => {
    expect(midi('A4')).toBe(69);
    expect(transpose('Bb1', 7)).toBe('F2');
    expect(transpose('D4', -12)).toBe('D3');
  });
});

describe('adaptive mix', () => {
  it('adds layers as intensity rises', () => {
    const calm = layerMix('wave', 0);
    const busy = layerMix('wave', 1);
    expect(calm.arp).toBe(0);
    expect(calm.timpani).toBe(0);
    expect(busy.arp).toBe(1);
    expect(busy.choir).toBe(1);
    for (const id of VOICE_IDS) expect(busy[id]).toBeGreaterThanOrEqual(calm[id] - 0.5);
  });

  it('gives the shop its music box and leaves stings to themselves', () => {
    expect(layerMix('shop', 1).box).toBe(1);
    expect(layerMix('shop', 1).lead).toBe(0);
    expect(Object.values(layerMix('defeat', 1)).every((v) => v === 0)).toBe(true);
  });

  it('speeds up a little with intensity', () => {
    expect(sceneTempo('wave', 1)).toBeGreaterThan(sceneTempo('wave', 0));
  });
});
