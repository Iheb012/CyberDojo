// Small AABB helpers shared by the tile (v1) and image (v2) engines.

export function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function containsPoint(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function rectCenter(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function distanceSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function normalize(dx, dy) {
  if (dx === 0 && dy === 0) {
    return { x: 0, y: 0 };
  }
  const length = Math.hypot(dx, dy);
  return { x: dx / length, y: dy / length };
}

export function expandRect(rect, amount) {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    w: rect.w + amount * 2,
    h: rect.h + amount * 2,
  };
}
