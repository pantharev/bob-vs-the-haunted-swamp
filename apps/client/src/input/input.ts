import type { InputCommand } from '@game/sim';
import { GamepadInput } from './gamepad';
import { FloatingJoystick } from './joystick';
import { KeyboardInput } from './keyboard';

/** Merges every local input device into the one command the sim consumes. */
export class Input {
  readonly keyboard = new KeyboardInput();
  readonly gamepad = new GamepadInput();
  readonly joystick: FloatingJoystick;

  constructor(surface: HTMLElement) {
    this.joystick = new FloatingJoystick(surface);
  }

  /** Touch wins while a finger is down, then gamepad, then keyboard. */
  sample(): InputCommand {
    if (this.joystick.active) return this.joystick.command();
    return this.gamepad.command() ?? this.keyboard.command();
  }

  reset(): void {
    this.keyboard.reset();
    this.joystick.reset();
  }
}
