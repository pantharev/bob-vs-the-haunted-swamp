import { ZONES } from '@game/content';
import { createWorld, DT, step } from '@game/sim';
import { Application } from 'pixi.js';
import { DebugOverlay } from './debug/overlay';
import { Input } from './input/input';
import { GameView } from './render/game-view';
import './style.css';

/** Longest frame we simulate; anything slower is treated as a hitch, not lost time. */
const MAX_FRAME_SECONDS = 0.25;
/** Cap on catch-up ticks per frame so a slow device can't spiral. */
const MAX_STEPS_PER_FRAME = 8;

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

  const seedParam = Number(new URLSearchParams(location.search).get('seed'));
  const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : Date.now() >>> 0;
  const world = createWorld({ seed, zone: ZONES.wolfmoor });

  const input = new Input(app.canvas);
  const view = new GameView(app, world);
  await view.load();
  const debug = new DebugOverlay();

  let accumulator = 0;
  let paused = document.hidden;
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    accumulator = 0;
    input.reset();
  });

  app.ticker.add((ticker) => {
    const frameSeconds = Math.min(ticker.deltaMS / 1000, MAX_FRAME_SECONDS);
    if (!paused) {
      accumulator += frameSeconds;
      const simStart = performance.now();
      let steps = 0;
      while (accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
        step(world, [input.sample()]);
        accumulator -= DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
      debug.recordSim(performance.now() - simStart, steps);
    }

    view.render(accumulator / DT, frameSeconds, input);

    debug.update(performance.now(), () => {
      const p = world.players[0];
      const { width, height } = app.screen;
      return [
        `fps ${ticker.FPS.toFixed(0)}  tick ${world.tick}  seed ${world.seed}`,
        `view ${width}×${height} @${app.renderer.resolution}x  scale ${view.camera.scale.toFixed(2)}`,
        p ? `bob ${p.x.toFixed(0)},${p.y.toFixed(0)}  v ${Math.hypot(p.vx, p.vy).toFixed(0)}` : 'no player',
      ];
    });
  });
}

boot().catch((error: unknown) => {
  console.error(error);
  document.body.textContent = `Failed to start: ${String(error)}`;
});
