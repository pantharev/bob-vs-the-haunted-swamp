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
