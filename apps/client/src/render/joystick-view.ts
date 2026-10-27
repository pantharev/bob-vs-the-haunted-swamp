import { Graphics } from 'pixi.js';
import { JOYSTICK_RADIUS, type FloatingJoystick } from '../input/joystick';

/** Screen-space ring and knob, drawn only while a finger (or mouse) is down. */
export class JoystickView {
  readonly root = new Graphics();

  update(joystick: FloatingJoystick): void {
    const g = this.root.clear();
    if (!joystick.active) return;
    g.circle(joystick.originX, joystick.originY, JOYSTICK_RADIUS)
      .fill({ color: 0x000000, alpha: 0.18 })
      .stroke({ width: 2, color: 0xcfe3d0, alpha: 0.35 });
    g.circle(joystick.knobX, joystick.knobY, 22).fill({ color: 0xcfe3d0, alpha: 0.4 });
  }
}
