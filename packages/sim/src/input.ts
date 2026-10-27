/**
 * One player's input for one sim tick. Every source (keyboard, joystick,
 * gamepad, network, replay) produces exactly this, so the sim never knows
 * where input came from.
 */
export interface InputCommand {
  /** Desired movement per axis in [-1, 1]; magnitudes above 1 are normalized. */
  readonly moveX: number;
  readonly moveY: number;
}

export const NEUTRAL_INPUT: InputCommand = Object.freeze({ moveX: 0, moveY: 0 });
