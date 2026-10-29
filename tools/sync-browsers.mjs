// Runs the co-op determinism self-test (the game's ?sync page, PLAN.md §9) in all three
// browser engines: Chromium (system Edge), Firefox (SpiderMonkey) and WebKit (JavaScriptCore).
//   npm run sync:browsers                     → against the dev server on :5173
//   npm run sync:browsers -- https://…app     → against a deployment
// Needs `npx playwright install firefox webkit` once.
import { chromium, firefox, webkit } from 'playwright';

const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const engines = [
  ['Chromium (Edge)', () => chromium.launch({ channel: 'msedge' })],
  ['Firefox', () => firefox.launch()],
  ['WebKit', () => webkit.launch()],
];

let failed = false;
for (const [name, launch] of engines) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/?sync`);
    await page.waitForFunction('document.documentElement.dataset.sync', null, { timeout: 300_000 });
    const report = await page.textContent('#report');
    const pass = report.startsWith('sync PASS');
    failed ||= !pass;
    console.log(`${pass ? '✓' : '✗'} ${name}\n${report.replace(/^/gm, '    ')}\n`);
  } catch (error) {
    failed = true;
    console.log(`✗ ${name}: ${error.message}\n`);
  } finally {
    await browser.close();
  }
}
process.exit(failed ? 1 : 0);
