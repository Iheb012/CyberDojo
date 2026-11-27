// Player descriptor loaded from assets/game/characters/character_1.json.
//
// The descriptor stores the hitbox in source-frame pixels ("before scaling").
// The engine works in room-image pixels, so every hitbox dimension and offset
// is multiplied by the selected variant's integer scale before use.

import { loadImage } from './map-loader.js';

export class Character {
  constructor(config, variantId = null) {
    this.config = config;
    this.variantId = variantId && config.variants[variantId] ? variantId : config.default;
    this.images = {};
  }

  get variant() {
    return this.config.variants[this.variantId];
  }

  get scale() {
    return Number(this.variant.playerScale ?? this.variant.scale) || 1;
  }

  get speed() {
    return Number(this.config.speed) || 140;
  }

  get reach() {
    return Number(this.config.interaction?.reach) || 40;
  }

  /** Raw hitbox, expressed in source-frame pixels (as written in the JSON). */
  get hitbox() {
    const { w, h, offsetX, offsetY } = this.variant.hitbox;
    return { w, h, offsetX, offsetY };
  }

  /** Hitbox converted to room-image pixels. */
  get worldHitbox() {
    const { w, h } = this.hitbox;
    return { w: w * this.scale, h: h * this.scale };
  }

  /** Select one of the sheet variants declared in the descriptor. */
  selectVariant(variantId) {
    if (variantId && this.config.variants[variantId]) {
      this.variantId = variantId;
      return true;
    }
    return false;
  }

  /** Feet box (top-left) for a player position expressed as the hitbox centre. */
  feetBox(x, y) {
    const { w, h } = this.worldHitbox;
    return { x: x - w / 2, y: y - h / 2, w, h };
  }

  /** Frame source rectangle for a direction and animation step. */
  frame(direction, step) {
    const variant = this.variant;
    const row = variant.rows[direction] ?? variant.rows.down ?? 0;
    const column = variant.walkCycle[step % variant.walkCycle.length];
    return {
      sx: column * variant.frameWidth,
      sy: row * variant.frameHeight,
      sw: variant.frameWidth,
      sh: variant.frameHeight,
    };
  }

  async load() {
    const urls = Object.values(this.config.variants).map((variant) => variant.src);
    await Promise.all(urls.map(async (url) => {
      this.images[url] = await loadImage(url);
    }));
  }

  image() {
    return this.images[this.variant.src];
  }

  /** Draw the frame so the configured hitbox centre lands on (x, y). */
  draw(ctx, direction, step, x, y) {
    const image = this.image();
    if (!image) {
      return;
    }

    const { offsetX, offsetY, w, h } = this.hitbox;
    const { sx, sy, sw, sh } = this.frame(direction, step);
    const scale = this.scale;
    const anchorX = offsetX + w / 2;
    const anchorY = offsetY + h / 2;
    const dx = x - anchorX * scale;
    const dy = y - anchorY * scale;

    ctx.drawImage(image, sx, sy, sw, sh, dx, dy, sw * scale, sh * scale);
  }
}

export async function loadCharacter(url, variantId = null) {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`Character ${url} returned ${response.status}`);
  }
  return new Character(await response.json(), variantId);
}
