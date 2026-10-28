import { describe, expect, it } from 'vitest';
import { renderSfx, SFX, SFX_IDS } from '../src/audio/sfx-bank';
import { VoicePool } from '../src/audio/sfx';
import { loudestRms, SAMPLE_RATE, Sound } from '../src/audio/synth';

const db = (x: number) => 20 * Math.log10(x);

describe('sfx bank', () => {
  it.each(SFX_IDS)('%s renders clean takes at its level', (id) => {
    const def = SFX[id];
    const takes = renderSfx(id);
    expect(takes).toHaveLength(def.variants);
    for (const data of takes) {
      let peak = 0;
      for (const v of data) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak).toBeLessThanOrEqual(0.98);
      expect(db(loudestRms(data))).toBeCloseTo(def.level, 0);
      expect(data.length / SAMPLE_RATE).toBeLessThan(4);
    }
  });

  it.each(SFX_IDS)('%s ends in silence rather than being cut off', (id) => {
    const def = SFX[id];
    const s = new Sound(def.seconds, 1);
    def.render(s);
    const room = s.data.length;
    expect(s.finish(def.level).length).toBeLessThan(room);
  });

  it('renders the same takes every time', () => {
    expect(renderSfx('hitBlade')).toEqual(renderSfx('hitBlade'));
  });

  it('gives each take its own seed', () => {
    const [a, b] = renderSfx('hitBlade');
    expect(a).not.toEqual(b);
  });
});

describe('voice pool', () => {
  it('spaces repeats of one sound by its gap', () => {
    const pool = new VoicePool();
    const gap = SFX.hitBlade.gap;
    expect(pool.admit('hitBlade', 0, 0.1)).toBe(true);
    expect(pool.admit('hitBlade', gap / 2, 0.1)).toBe(false);
    expect(pool.admit('hitBlade', gap, 0.1)).toBe(true);
  });

  it('caps the copies of one sound playing at once', () => {
    const pool = new VoicePool();
    const { voices, gap } = SFX.coin;
    let admitted = 0;
    for (let i = 0; i < voices * 3; i++) if (pool.admit('coin', i * gap, 10)) admitted++;
    expect(admitted).toBe(voices);
    // Once they finish, coins play again.
    expect(pool.admit('coin', 100, 0.2)).toBe(true);
  });

  it('drops low-priority sounds first when the mix is crowded', () => {
    const pool = new VoicePool();
    // Fill the mix with many different long sounds.
    const fillers = SFX_IDS.filter((id) => SFX[id].priority === 1);
    let t = 0;
    for (let round = 0; round < 10; round++) {
      for (const id of fillers) pool.admit(id, (t += 0.001), 50);
    }
    expect(pool.admit('coin', (t += 0.001), 0.2)).toBe(false);
    expect(pool.admit('hurt', t + 0.001, 0.2)).toBe(true);
  });
});
