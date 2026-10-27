import type { InputCommand } from '@game/sim';

const STICK_DEADZONE = 0.2;

/** Left stick of the first connected gamepad that is being pushed. */
export class GamepadInput {
  command(): InputCommand | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      const len = Math.sqrt(x * x + y * y);
      if (len < STICK_DEADZONE) continue;
      const magnitude = Math.min(1, (len - STICK_DEADZONE) / (1 - STICK_DEADZONE));
      return { moveX: (x / len) * magnitude, moveY: (y / len) * magnitude };
    }
    return null;
  }
}
