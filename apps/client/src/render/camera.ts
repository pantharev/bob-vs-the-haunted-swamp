import type { Arena } from '@game/sim';

/**
 * World units visible across the screen's short side. Portrait and landscape
 * therefore see the same distance around Bob in their tight direction.
 */
export const VIEW_SHORT_SIDE = 640;
/** Big monitors see more world instead of a giant Bob. */
const MAX_SCALE = 1.5;
const MIN_SCALE = 0.3;
/** How quickly the camera catches up with its target (1/s). */
const FOLLOW_RATE = 9;
/** How much void past the arena edge may come into view (wu). */
const EDGE_MARGIN = 140;
/** Screen shake at full trauma (wu), and how fast trauma fades (1/s). */
const MAX_SHAKE = 14;
const TRAUMA_DECAY = 1.8;

export class Camera {
  x = 0;
  y = 0;
  scale = 1;
  /** Visible world size (wu). */
  viewWidth = 0;
  viewHeight = 0;
  /** Shake offset to add on top of the follow position (wu). */
  shakeX = 0;
  shakeY = 0;
  private trauma = 0;
  private time = 0;

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** Adds screen shake (0..1). Shake grows with trauma squared, so small hits stay subtle. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(
    targetX: number,
    targetY: number,
    screenWidth: number,
    screenHeight: number,
    dt: number,
    arena: Arena,
  ): void {
    const scale = Math.min(screenWidth, screenHeight) / VIEW_SHORT_SIDE;
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    this.viewWidth = screenWidth / this.scale;
    this.viewHeight = screenHeight / this.scale;

    const k = 1 - Math.exp(-FOLLOW_RATE * dt);
    this.x = clampAxis(this.x + (targetX - this.x) * k, this.viewWidth, arena.width);
    this.y = clampAxis(this.y + (targetY - this.y) * k, this.viewHeight, arena.height);

    this.time += dt;
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
    const shake = this.trauma * this.trauma * MAX_SHAKE;
    // Incommensurate sines read as noise without a noise function.
    this.shakeX = shake * (Math.sin(this.time * 47) * 0.6 + Math.sin(this.time * 83) * 0.4);
    this.shakeY = shake * (Math.sin(this.time * 53) * 0.6 + Math.sin(this.time * 71) * 0.4);
  }
}

function clampAxis(centre: number, view: number, size: number): number {
  const min = view / 2 - EDGE_MARGIN;
  const max = size - view / 2 + EDGE_MARGIN;
  if (min > max) return size / 2;
  return Math.min(max, Math.max(min, centre));
}
