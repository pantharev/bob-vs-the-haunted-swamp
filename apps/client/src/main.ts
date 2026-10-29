import { WEAPON_IDS, type WeaponId } from '@game/content';
import { Application } from 'pixi.js';
import { GameAudio } from './audio/audio';
import { DebugOverlay } from './debug/overlay';
import { Game } from './game';
import { Input } from './input/input';
import { createArt } from './render/art';
import { GameView } from './render/game-view';
import { mountUi } from './ui/app';
import './style.css';
import './ui/ui.css';

async function boot(): Promise<void> {
  // ?sync: the co-op determinism self-test (PLAN.md §9, 5a) instead of the game.
  if (new URLSearchParams(location.search).has('sync')) {
    const { runSyncCheck } = await import('./selftest/sync');
    await runSyncCheck(document.body);
    return;
  }
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#07090b',
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
  });
  const mount = document.getElementById('app');
  if (!mount) throw new Error('#app mount point missing');
  mount.appendChild(app.canvas);

  // iOS: block pinch-zoom gestures and the long-press callout over the canvas.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const art = await createArt(app.renderer, import.meta.env.BASE_URL);
  const view = new GameView(app, art);
  const game = new Game(app, view, new Input(app.canvas), new GameAudio(), new DebugOverlay());
  mountUi(game);

  // Dev/test shortcuts: ?weapon=staff&wave=5&seed=42 starts a run immediately.
  const params = new URLSearchParams(location.search);
  // ?room=K7QX2M: an invite link to a co-op game (PLAN.md §9).
  const room = params.get('room');
  if (room) game.openCoop({ mode: 'join', code: room.toUpperCase() });
  // ?bots=3: local bot teammates, to try co-op before the server exists (PLAN.md §9).
  const bots = Number(params.get('bots'));
  if (bots > 0) game.useBots(bots, await import('../../../packages/sim/test/bot'));
  const weapon = params.get('weapon');
  if (weapon && (WEAPON_IDS as readonly string[]).includes(weapon)) {
    const seed = Number(params.get('seed'));
    const wave = Number(params.get('wave'));
    game.startRun({
      weapon: weapon as WeaponId,
      seed: Number.isFinite(seed) && seed > 0 ? seed : undefined,
      wave: Number.isFinite(wave) && wave > 0 ? wave : undefined,
    });
  }
  if (import.meta.env.DEV) Object.assign(window, { game });
}

boot().catch((error: unknown) => {
  console.error(error);
  document.body.textContent = `Failed to start: ${String(error)}`;
});
