import { SYNC_CASES, syncHashes } from '../../../../packages/sim/test/sync';
import expected from './sync-expected.json';

/**
 * The co-op lockstep check (PLAN.md §9, 5a), opened with `?sync`: plays the
 * fixture's bot runs in this browser and compares the world hash every second
 * with the ones Node computed. Any difference means this engine computes the
 * sim differently, and lockstep would desync on it.
 */

interface Outcome {
  readonly name: string;
  readonly checked: number;
  readonly total: number;
  /** Seconds of wave time where the first difference showed, or null. */
  readonly differsAt: number | null;
  readonly ms: number;
}

/** Work per animation frame, so the page keeps painting progress. */
const SLICE_MS = 12;

export async function runSyncCheck(root: HTMLElement): Promise<void> {
  document.title = 'Sync check · Bob vs. the Haunted Swamp';
  Object.assign(document.documentElement.style, { overflow: 'auto', height: 'auto' });
  Object.assign(document.body.style, {
    overflow: 'auto',
    height: 'auto',
    userSelect: 'text',
    touchAction: 'auto',
  });
  root.innerHTML = `
    <main style="max-width: 560px; margin: 0 auto; padding: 28px 18px; color: #ece3cc;
      font: 16px/1.45 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif;">
      <h1 style="margin: 0 0 4px; font: 700 28px Georgia, serif; color: #f2c14e;">Sync check</h1>
      <p style="margin: 0 0 18px; color: #a99d84;">Plays two full runs in this browser and checks that every
        second comes out exactly as on the game server. Keep this tab open until it finishes.</p>
      <ul id="cases" style="list-style: none; margin: 0; padding: 0;"></ul>
      <p id="verdict" style="margin: 22px 0 10px; font: 700 26px Georgia, serif;">Running…</p>
      <pre id="report" style="white-space: pre-wrap; padding: 10px; border-radius: 8px;
        background: #17130e; color: #cfe3d0; font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace;"></pre>
      <button id="copy" style="min-height: 44px; padding: 8px 16px; border: 2px solid #c99a35;
        border-radius: 8px; background: #5e4214; color: #fff6dc; font: 700 15px inherit;" hidden>Copy result</button>
    </main>`;
  const list = root.querySelector<HTMLUListElement>('#cases')!;
  const rows = SYNC_CASES.map((c) => {
    const li = document.createElement('li');
    li.style.margin = '6px 0';
    li.textContent = `${c.name}: waiting`;
    list.appendChild(li);
    return li;
  });

  const outcomes: Outcome[] = [];
  for (const [i, c] of SYNC_CASES.entries()) {
    const want = expected.find((e) => e.name === c.name)?.hashes ?? [];
    outcomes.push(await check(c, want, rows[i]!));
  }

  const ok = outcomes.every((o) => o.differsAt === null && o.checked === o.total);
  const verdict = root.querySelector<HTMLElement>('#verdict')!;
  verdict.textContent = ok ? '✓ Identical to the server' : '✗ This browser computes differently';
  verdict.style.color = ok ? '#7be36a' : '#ff6a4a';
  const report = [
    `sync ${ok ? 'PASS' : 'FAIL'}`,
    ...outcomes.map(
      (o) =>
        `${o.name}: ${o.differsAt === null ? 'identical' : `differs at ${clock(o.differsAt)}`} ` +
        `(${o.checked}/${o.total} checkpoints, ${(o.ms / 1000).toFixed(1)} s)`,
    ),
    navigator.userAgent,
  ].join('\n');
  root.querySelector('#report')!.textContent = report;
  const copy = root.querySelector<HTMLButtonElement>('#copy')!;
  copy.hidden = false;
  copy.onclick = () =>
    navigator.clipboard?.writeText(report).then(
      () => (copy.textContent = 'Copied'),
      () => (copy.textContent = 'Select the text above to copy it'),
    );
  // For headless checks.
  document.documentElement.dataset.sync = ok ? 'pass' : 'fail';
}

function check(
  c: (typeof SYNC_CASES)[number],
  want: readonly number[],
  row: HTMLElement,
): Promise<Outcome> {
  return new Promise((resolve) => {
    const run = syncHashes(c);
    const start = performance.now();
    let checked = 0;
    const slice = () => {
      const until = performance.now() + SLICE_MS;
      while (performance.now() < until) {
        const next = run.next();
        if (next.done) return finish(null);
        if (next.value !== want[checked]) return finish(checked + 1);
        checked++;
      }
      row.textContent = `${c.name}: ${clock(checked)} of ${clock(want.length - 1)} checked…`;
      requestAnimationFrame(slice);
    };
    const finish = (differsAt: number | null) => {
      const outcome = {
        name: c.name,
        checked,
        total: want.length,
        differsAt,
        ms: performance.now() - start,
      };
      row.textContent =
        differsAt === null && checked === want.length
          ? `✓ ${c.name}: all ${checked} checkpoints identical`
          : `✗ ${c.name}: ${differsAt === null ? 'ended early' : `differs at ${clock(differsAt)}`}`;
      resolve(outcome);
    };
    requestAnimationFrame(slice);
  });
}

/** Seconds of wave time as m:ss. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
