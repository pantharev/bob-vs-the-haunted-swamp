import { describe, expect, it } from 'vitest';
import { SYNC_CASES, syncHashes } from './sync';

describe('cross-engine sync fixture', () => {
  // The browser self-test compares against this file. When the rules change on
  // purpose, regenerate it with `npx vitest run -u`.
  it('matches the hashes the browser self-test expects', async () => {
    const expected = SYNC_CASES.map((c) => ({ name: c.name, hashes: [...syncHashes(c)] }));
    await expect(`${JSON.stringify(expected)}\n`).toMatchFileSnapshot(
      '../../../apps/client/src/selftest/sync-expected.json',
    );
  }, 60_000);

  it('is the same run twice', () => {
    const c = SYNC_CASES[1]!;
    const first = [...syncHashes(c)];
    expect(first.length).toBeGreaterThan(60);
    expect([...syncHashes(c)]).toEqual(first);
  }, 60_000);
});
