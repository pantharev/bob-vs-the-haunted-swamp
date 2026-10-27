/** Text refreshes this often (ms); faster just causes layout churn. */
const REFRESH_MS = 250;

/**
 * Corner readout of frame rate, sim cost and view metrics. On by default in
 * dev builds; the backquote key toggles it.
 */
export class DebugOverlay {
  private readonly el = document.createElement('div');
  private visible = import.meta.env.DEV;
  private simMs = 0;
  private steps = 0;
  private lastRefresh = 0;

  constructor() {
    this.el.id = 'debug';
    this.el.hidden = !this.visible;
    document.body.appendChild(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Backquote') return;
      this.visible = !this.visible;
      this.el.hidden = !this.visible;
    });
  }

  recordSim(ms: number, steps: number): void {
    this.simMs += (ms - this.simMs) * 0.1;
    this.steps = steps;
  }

  update(now: number, lines: () => string[]): void {
    if (!this.visible || now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;
    this.el.textContent = [`sim ${this.simMs.toFixed(3)} ms  ×${this.steps}`, ...lines()].join('\n');
  }
}
