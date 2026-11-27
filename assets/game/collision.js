// Axis-separated AABB movement for the v2 engine.
//
// The player is represented by the tiny feet box only. Each axis is swept
// against walls, solid NPCs and the map bounds, which prevents tunnelling at
// any speed and lets the box slide along a wall instead of sticking.

import { intersects } from './geometry.js';

/**
 * Sweep one axis of `box` by `delta` and return the allowed delta.
 * Boxes already overlapping the mover are ignored so a bad spawn can escape.
 */
function sweep(box, axis, delta, blockers, bounds) {
  let allowed = delta;

  for (const blocker of blockers) {
    if (intersects(box, blocker)) {
      continue;
    }

    if (axis === 'x') {
      const verticalOverlap = box.y < blocker.y + blocker.h && box.y + box.h > blocker.y;
      if (!verticalOverlap) {
        continue;
      }
      if (delta > 0 && box.x + box.w <= blocker.x) {
        allowed = Math.min(allowed, blocker.x - (box.x + box.w));
      } else if (delta < 0 && box.x >= blocker.x + blocker.w) {
        allowed = Math.max(allowed, blocker.x + blocker.w - box.x);
      }
    } else {
      const horizontalOverlap = box.x < blocker.x + blocker.w && box.x + box.w > blocker.x;
      if (!horizontalOverlap) {
        continue;
      }
      if (delta > 0 && box.y + box.h <= blocker.y) {
        allowed = Math.min(allowed, blocker.y - (box.y + box.h));
      } else if (delta < 0 && box.y >= blocker.y + blocker.h) {
        allowed = Math.max(allowed, blocker.y + blocker.h - box.y);
      }
    }
  }

  if (bounds) {
    if (axis === 'x') {
      if (delta > 0) {
        allowed = Math.min(allowed, bounds.w - (box.x + box.w));
      } else if (delta < 0) {
        allowed = Math.max(allowed, -box.x);
      }
    } else if (delta > 0) {
      allowed = Math.min(allowed, bounds.h - (box.y + box.h));
    } else if (delta < 0) {
      allowed = Math.max(allowed, -box.y);
    }
  }

  return allowed;
}

/**
 * Move a feet box by (dx, dy) in map pixels.
 *
 * @param {{x:number,y:number,w:number,h:number}} feet
 * @param {number} dx
 * @param {number} dy
 * @param {{walls?: object[], solids?: object[], bounds?: {w:number,h:number}}} world
 * @returns {{x:number,y:number}}
 */
export function moveFeet(feet, dx, dy, { walls = [], solids = [], bounds = null } = {}) {
  const blockers = walls.concat(solids);
  const box = { ...feet };

  // Never move farther than the box size in one go: belt and braces on top of
  // the sweep, and keeps the resolution stable for very large frame deltas.
  const maxStep = Math.max(1, Math.min(feet.w, feet.h));
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
  const stepX = dx / steps;
  const stepY = dy / steps;

  for (let i = 0; i < steps; i += 1) {
    if (stepX !== 0) {
      box.x += sweep(box, 'x', stepX, blockers, bounds);
    }
    if (stepY !== 0) {
      box.y += sweep(box, 'y', stepY, blockers, bounds);
    }
  }

  return { x: box.x, y: box.y };
}
