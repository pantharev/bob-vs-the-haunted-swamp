import { NEUTRAL_INPUT, type InputCommand } from '@game/sim';

const BINDINGS: Readonly<Record<string, readonly [number, number]>> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export class KeyboardInput {
  private readonly held = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!Object.hasOwn(BINDINGS, e.code) || typingIn(e)) return;
      this.held.add(e.code);
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.reset());
  }

  command(): InputCommand {
    let x = 0;
    let y = 0;
    for (const code of this.held) {
      const binding = BINDINGS[code];
      if (!binding) continue;
      x += binding[0];
      y += binding[1];
    }
    const len = Math.sqrt(x * x + y * y);
    return len > 0 ? { moveX: x / len, moveY: y / len } : NEUTRAL_INPUT;
  }

  reset(): void {
    this.held.clear();
  }
}

/** Keys pressed while a text field has focus belong to the field (a hiscores name), not the game. */
export function typingIn(e: KeyboardEvent): boolean {
  const target = e.target;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  );
}
