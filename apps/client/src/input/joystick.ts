import { NEUTRAL_INPUT, type InputCommand } from '@game/sim';

/** Full-deflection distance from the stick's origin (CSS px). */
export const JOYSTICK_RADIUS = 56;
/** Fraction of the radius ignored around the origin. */
const DEADZONE = 0.12;

/**
 * Floating virtual joystick: it appears wherever the first finger lands, so
 * it works one-handed in portrait and landscape. If the thumb travels past
 * the radius, the origin is dragged along behind it, so reversing direction
 * is instant instead of first crossing back over a fixed centre.
 *
 * Mouse drags drive it too, which makes desktop testing match mobile.
 */
export class FloatingJoystick {
  active = false;
  /** Origin and knob positions in CSS px relative to the surface. */
  originX = 0;
  originY = 0;
  knobX = 0;
  knobY = 0;
  private pointerId: number | null = null;

  constructor(private readonly surface: HTMLElement) {
    surface.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  command(): InputCommand {
    const dx = (this.knobX - this.originX) / JOYSTICK_RADIUS;
    const dy = (this.knobY - this.originY) / JOYSTICK_RADIUS;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < DEADZONE) return NEUTRAL_INPUT;
    // Rescale so output ramps from 0 at the deadzone edge to 1 at full deflection.
    const magnitude = Math.min(1, (len - DEADZONE) / (1 - DEADZONE));
    return { moveX: (dx / len) * magnitude, moveY: (dy / len) * magnitude };
  }

  reset(): void {
    this.active = false;
    this.pointerId = null;
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.pointerId = e.pointerId;
    this.active = true;
    const { x, y } = this.local(e);
    this.originX = this.knobX = x;
    this.originY = this.knobY = y;
    this.surface.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    const { x, y } = this.local(e);
    const dx = x - this.originX;
    const dy = y - this.originY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > JOYSTICK_RADIUS) {
      this.originX = x - (dx / len) * JOYSTICK_RADIUS;
      this.originY = y - (dy / len) * JOYSTICK_RADIUS;
    }
    this.knobX = x;
    this.knobY = y;
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.pointerId) this.reset();
  };

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = this.surface.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
