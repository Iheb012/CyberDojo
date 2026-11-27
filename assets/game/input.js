// Keyboard state for the v2 engine.
//
// Arrows, ZQSD (AZERTY) and WASD (QWERTY) all map to the same four directions.
// The controller forwards keydown/keyup and decides when input is allowed
// (challenge window open, map loading, ...).

import { normalize } from './geometry.js';

const DIRECTIONS = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  z: 'up',
  w: 'up',
  s: 'down',
  q: 'left',
  a: 'left',
  d: 'right',
};

export function directionForKey(key) {
  return DIRECTIONS[String(key).toLowerCase()] ?? null;
}

export class Input {
  constructor() {
    this.pressed = new Set();
  }

  press(key) {
    const direction = directionForKey(key);
    if (direction) {
      this.pressed.add(direction);
    }
    return direction;
  }

  release(key) {
    const direction = directionForKey(key);
    if (direction) {
      this.pressed.delete(direction);
    }
  }

  clear() {
    this.pressed.clear();
  }

  /** Normalised direction vector, diagonals included. */
  direction() {
    const dx = (this.pressed.has('right') ? 1 : 0) - (this.pressed.has('left') ? 1 : 0);
    const dy = (this.pressed.has('down') ? 1 : 0) - (this.pressed.has('up') ? 1 : 0);
    return normalize(dx, dy);
  }

  /** Facing derived from the direction, keeping the last axis on diagonals. */
  facing(previous = 'down') {
    const { x, y } = this.direction();
    if (x === 0 && y === 0) {
      return previous;
    }
    if (Math.abs(x) >= Math.abs(y)) {
      return x > 0 ? 'right' : 'left';
    }
    return y > 0 ? 'down' : 'up';
  }
}
