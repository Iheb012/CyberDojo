// Viewport/camera for the v2 image maps.
//
// "fit" contains the whole room in the stage, with an integer scale when the
// room is smaller than the viewport. "follow" keeps the player centred at the
// map zoom, clamped to the room edges.

import { clamp } from './geometry.js';

export class Camera {
  constructor(map) {
    this.map = map;
    this.mode = map.camera === 'follow' ? 'follow' : 'fit';
    this.zoom = Number.isFinite(map.zoom) && map.zoom > 0 ? map.zoom : 1;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.viewW = 1;
    this.viewH = 1;
  }

  resize(viewW, viewH) {
    this.viewW = Math.max(1, viewW);
    this.viewH = Math.max(1, viewH);

    if (this.mode === 'follow') {
      this.scale = this.zoom;
      return;
    }

    let scale = Math.min(this.viewW / this.map.width, this.viewH / this.map.height);
    if (scale >= 1) {
      scale = Math.floor(scale);
    }
    this.scale = Math.max(0.05, scale);
    this.x = (this.map.width - this.viewW / this.scale) / 2;
    this.y = (this.map.height - this.viewH / this.scale) / 2;
  }

  update(player) {
    if (this.mode !== 'follow') {
      return;
    }

    const halfW = this.viewW / (2 * this.scale);
    const halfH = this.viewH / (2 * this.scale);

    this.x = this.map.width <= halfW * 2
      ? (this.map.width - halfW * 2) / 2
      : clamp(player.x - halfW, 0, this.map.width - halfW * 2);
    this.y = this.map.height <= halfH * 2
      ? (this.map.height - halfH * 2) / 2
      : clamp(player.y - halfH, 0, this.map.height - halfH * 2);
  }

  worldToScreen(x, y) {
    return { x: (x - this.x) * this.scale, y: (y - this.y) * this.scale };
  }

  screenToWorld(x, y) {
    return { x: x / this.scale + this.x, y: y / this.scale + this.y };
  }

  apply(ctx) {
    ctx.setTransform(this.scale, 0, 0, this.scale, -this.x * this.scale, -this.y * this.scale);
  }
}
