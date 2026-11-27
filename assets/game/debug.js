// Debug overlay (F2, dev only): walls, doors, slots, interactables, NPCs,
// the feet box and the interaction reach rectangle.

const COLORS = {
  walls: '#ff3b3b',
  doors: '#37d67a',
  slots: '#3b82f6',
  interactables: '#22d3ee',
  npcs: '#a855f7',
  feet: '#facc15',
  reach: '#fb923c',
};

function outline(ctx, rect, color, fill = true) {
  if (fill) {
    ctx.fillStyle = `${color}33`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.strokeStyle = color;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
}

export function drawDebugOverlay(ctx, engine) {
  const lineWidth = 2 / engine.camera.scale;
  ctx.save();
  ctx.lineWidth = lineWidth;

  for (const wall of engine.walls) {
    outline(ctx, wall, COLORS.walls);
  }
  for (const door of engine.doors) {
    outline(ctx, door.rect, COLORS.doors);
  }
  for (const slot of engine.slots) {
    outline(ctx, slot.rect, COLORS.slots, false);
  }
  for (const interactable of engine.interactables) {
    outline(ctx, interactable.rect, COLORS.interactables, false);
  }
  for (const npc of engine.npcs) {
    outline(ctx, engine.npcBox(npc), COLORS.npcs, false);
  }

  outline(ctx, engine.feetBox(), COLORS.feet, false);
  outline(ctx, engine.reachRect(), COLORS.reach, false);

  ctx.restore();
}
