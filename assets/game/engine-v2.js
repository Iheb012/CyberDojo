// Image-map engine for the nine hand-painted rooms.
//
// The player moves freely (px/second) with a tiny feet hitbox; walls, doors,
// slots, interactables and NPCs are data in the JSON, in the room's pixels.

import { Camera } from './camera.js';
import { Character } from './character.js';
import { Input } from './input.js';
import { moveFeet } from './collision.js';
import { intersects, rectCenter, distanceSq, clamp } from './geometry.js';
import { loadImage } from './map-loader.js';
import { drawDebugOverlay } from './debug.js';

const FADE_DURATION = 180;
const DOOR_COOLDOWN = 600;
const NPC_SOLID = { w: 26, h: 14 };
const NPC_ANIMATIONS = ['idle', 'walk'];
const NPC_ANIMATION_WEIGHTS = { idle: 60, walk: 40 };
const NPC_CYCLE_MS = 10000;
const NPC_TALK_MS = 2200;
const NPC_ATLAS_DIRS = ['down', 'left', 'up', 'right'];
const NPC_ATLAS_ANIMS = ['idle', 'walk', 'talk', 'think'];
const NPC_FACING_SPRITES = {
  down: 'spriteDown',
  up: 'spriteUp',
  left: 'spriteLeft',
  right: 'spriteRight',
};
const INTERACTABLE_TITLES = {
  scoreboard: 'Tableau des scores',
  badge_wall: 'Mur des badges',
  belt_stand: 'Support des ceintures',
  diploma_desk: 'Bureau des diplômes',
  library_desk: 'Bureau de la bibliothèque',
  wardrobe: 'Vestiaire',
  info_board: "Tableau d'affichage",
};
const OBJECT_GLYPHS = { terminal: 'T', coffre: 'C', porte: 'P', serveur: 'S' };
const STATE_STYLES = {
  verrouille: { fill: '#4b5563', stroke: '#9ca3af' },
  disponible: { fill: '#b45309', stroke: '#fbbf24' },
  resolu: { fill: '#166534', stroke: '#4ade80' },
};

function humanize(value) {
  const text = String(value ?? '').replace(/[-_]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Objet';
}

function randomInRange(min, max) {
  const start = Number(min);
  const end = Number(max);
  const low = Number.isFinite(start) ? start : 0;
  const high = Number.isFinite(end) ? end : low;
  return low + Math.random() * Math.max(0, high - low);
}

/** Turn map weights into phase durations for an NPC's idle/walk cycle. */
function npcTiming(npc) {
  const behavior = npc.behavior ?? {};
  const weights = { ...NPC_ANIMATION_WEIGHTS, ...(behavior.weights ?? {}) };
  const total = NPC_ANIMATIONS.reduce(
    (sum, name) => sum + Math.max(0, Number(weights[name]) || 0),
    0,
  ) || 1;
  const cycle = Math.max(1000, Number(behavior.cycle) || NPC_CYCLE_MS);
  const durations = {};
  NPC_ANIMATIONS.forEach((name) => {
    durations[name] = cycle * (Math.max(0, Number(weights[name]) || 0) / total);
  });
  return {
    durations,
    talk: Math.max(200, Number(behavior.talk) || NPC_TALK_MS),
  };
}

function nextNpcAnimation(name) {
  const index = NPC_ANIMATIONS.indexOf(name);
  return NPC_ANIMATIONS[(index + 1) % NPC_ANIMATIONS.length];
}

export class EngineV2 {
  constructor({
    canvas, stage, map, objects = [], character, input, debug = false,
    sprites = {}, onHint, onDoor, onProgress,
  }) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext('2d');
    this.map = map;
    this.objects = objects;
    this.character = character;
    this.input = input instanceof Input ? input : new Input();
    this.debug = Boolean(debug);
    this.sprites = sprites;
    this.onHint = onHint;
    this.onDoor = onDoor;
    this.onProgress = onProgress;

    this.camera = new Camera(map);
    this.walls = map.walls ?? [];
    this.doors = map.doors ?? [];
    this.slots = map.slots ?? [];
    this.interactables = map.interactables ?? [];
    this.npcs = map.npcs ?? [];
    this.npcStates = this.npcs.map((npc) => {
      const start = performance.now();
      const behavior = npc.behavior ?? {};
      const { durations } = npcTiming(npc);
      const idleFor = behavior.random
        ? randomInRange(behavior.idleMin ?? 800, behavior.idleMax ?? 2400)
        : durations.idle;
      return {
        dir: npc.motion?.dir ?? 1,
        facing: 'down',
        vx: 0,
        vy: 0,
        phase: 'idle',
        phaseStart: start,
        phaseUntil: start + idleFor,
        nextDecisionAt: start + idleFor,
        target: null,
        animation: 'idle',
        animationStart: start,
        talkUntil: 0,
        moving: false,
        idleKind: 'idle',                              // 'idle' or 'think' while standing still
        thinkChance: Number(behavior.thinkChance ?? 0),
        lineIndex: 0,
        say: '',                                       // speech bubble text while talking
      };
    });
    this.solids = this.npcs.map((npc) => this.npcBox(npc));

    this.player = { x: map.spawn?.x ?? map.width / 2, y: map.spawn?.y ?? map.height / 2 };
    this.facing = 'down';
    this.moving = false;
    this.animTick = 0;   // independent NPC idle animation clock
    this.animTime = 0;
    this.walkStep = 0;
    this.dirty = true;
    this.destroyed = false;
    this.doorLock = null;
    this.doorCooldownUntil = 0;
    this.doorBusy = false;
    this.fadeAlpha = 0;
    this.fadeState = null;
    this.hintUntil = 0;
    this.hintText = '';
    this.target = null;
    this.mouse = null;
    this.editing = false; // F3 map editor freezes movement
    this.overlay = null;  // editor's canvas overlay callback

    this.onMouseMove = (event) => {
      const bounds = this.canvas.getBoundingClientRect();
      this.mouse = this.camera.screenToWorld(
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      );
    };
  }

  async load({ spawn = null, facing = null } = {}) {
    if (spawn) {
      this.player = { x: spawn.x, y: spawn.y };
    }
    if (facing) {
      this.facing = facing;
    }

    this.onProgress?.(0.1);
    if (!this.character.image()) {
      await this.character.load();
    }
    this.image = await loadImage(this.map.image);
    this.onProgress?.(0.7);
    if (!this.map.width) {
      this.map.width = this.image.naturalWidth;
    }
    if (!this.map.height) {
      this.map.height = this.image.naturalHeight;
    }

    this.setObjects(this.objects);
    this.onProgress?.(0.85);
    this.resize();
    this.camera.update(this.player);
    this.doorCooldownUntil = performance.now() + DOOR_COOLDOWN;
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.updateHint(performance.now(), true);
    this.dirty = true;
    this.onProgress?.(1);
  }

  get idleStep() {
    const variant = this.character.variant;
    const index = variant.walkCycle.indexOf(variant.idle);
    return index >= 0 ? index : 0;
  }

  setObjects(objects) {
    this.objects = objects ?? [];
    this.objectsBySlot = new Map();
    for (const object of this.objects) {
      if (object.slot) {
        this.objectsBySlot.set(object.slot, object);
      }
    }
    this.target = null;
    this.hintText = '';
    this.hintUntil = 0;
    this.dirty = true;
  }

  /** Switch between the sprite-sheet variants declared in the character JSON. */
  setVariant(variantId) {
    if (this.character.selectVariant(variantId)) {
      this.dirty = true;
    }
  }

  setDebug(enabled) {
    this.debug = Boolean(enabled);
    this.dirty = true;
  }

  /** The editor owns the mouse and arrow keys while it is open. */
  setEditing(enabled) {
    this.editing = Boolean(enabled);
    this.input.clear();
    this.dirty = true;
  }

  /** Replace the map data after an editor undo, then rebuild derived arrays. */
  replaceMap(map) {
    this.map = map;
    this.walls = map.walls ?? [];
    this.doors = map.doors ?? [];
    this.slots = map.slots ?? [];
    this.interactables = map.interactables ?? [];
    this.npcs = map.npcs ?? [];
    this.npcStates = this.npcs.map((npc) => {
      const start = performance.now();
      const behavior = npc.behavior ?? {};
      const { durations } = npcTiming(npc);
      const idleFor = behavior.random
        ? randomInRange(behavior.idleMin ?? 800, behavior.idleMax ?? 2400)
        : durations.idle;
      return {
        dir: npc.motion?.dir ?? 1,
        facing: 'down',
        vx: 0,
        vy: 0,
        phase: 'idle',
        phaseStart: start,
        phaseUntil: start + idleFor,
        nextDecisionAt: start + idleFor,
        target: null,
        animation: 'idle',
        animationStart: start,
        talkUntil: 0,
        moving: false,
        idleKind: 'idle',                              // 'idle' or 'think' while standing still
        thinkChance: Number(behavior.thinkChance ?? 0),
        lineIndex: 0,
        say: '',                                       // speech bubble text while talking
      };
    });
    this.solids = this.npcs.map((npc) => this.npcBox(npc));
    this.setObjects(this.objects);
    this.resize();
    this.doorLock = null;
    this.doorBusy = false;
    this.dirty = true;
  }

  resize() {
    const width = Math.max(1, this.stage.clientWidth);
    const height = Math.max(1, this.stage.clientHeight);
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.imageSmoothingEnabled = false;
    this.camera.resize(width, height);
    this.camera.update(this.player);
    this.dirty = true;
  }

  update(dt, now) {
    if (this.destroyed) {
      return;
    }

    this.updateFade(now);

    // NPC idle animation has its own clock: it must not depend on the player
    // moving (render() otherwise skips frames while the player stands still).
    const tick = Math.floor(now / 100);
    if (tick !== this.animTick) {
      this.animTick = tick;
      this.dirty = true;
    }

    if (!this.doorBusy && !this.fadeState) {
      this.move(dt, now);
    }

    this.updateNpcMotion(dt, now);

    const before = { x: this.camera.x, y: this.camera.y, scale: this.camera.scale };
    this.camera.update(this.player);
    if (before.x !== this.camera.x || before.y !== this.camera.y || before.scale !== this.camera.scale) {
      this.dirty = true;
    }

    this.updateHint(now);
  }

  move(dt, now) {
    if (this.editing) {
      return;
    }

    const direction = this.input.direction();
    this.moving = direction.x !== 0 || direction.y !== 0;

    if (!this.moving) {
      this.animTime = 0;
      this.walkStep = this.idleStep;
      return;
    }

    this.facing = this.input.facing(this.facing);

    const feet = this.feetBox();
    const distance = this.character.speed * dt;
    const moved = moveFeet(
      feet,
      direction.x * distance,
      direction.y * distance,
      {
        walls: this.walls,
        solids: this.solids,
        bounds: { w: this.map.width, h: this.map.height },
      },
    );

    this.player = { x: moved.x + feet.w / 2, y: moved.y + feet.h / 2 };
    this.animTime += dt;
    this.walkStep = Math.floor(this.animTime * this.character.variant.fps) % this.character.variant.walkCycle.length;
    this.dirty = true;

    this.checkDoors(now);
  }

  /** Autonomous NPC states: idle/walk on their own clock, talk on interaction. */
  updateNpcMotion(dt, now) {
    let changed = false;

    this.npcs.forEach((npc, index) => {
      const state = this.npcStates[index];
      const behavior = npc.behavior ?? {};
      const { durations } = npcTiming(npc);

      if (now < state.talkUntil) {
        state.animation = 'talk';
        state.moving = false;
        return;
      }

      if (state.animation === 'talk') {
        state.animation = state.phase === 'walk' ? 'walk' : state.idleKind;
        state.animationStart = now;
        state.say = '';
        this.dirty = true;
      }

      const route = npc.motion;
      if (!route) {
        if (state.animation !== 'idle') {
          state.animation = 'idle';
          state.animationStart = now;
        }
        state.moving = false;
        return;
      }

      const min = Number(route.minX);
      const max = Number(route.maxX);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        state.moving = false;
        return;
      }

      // The dojo sensei: random pauses, then smooth walks to random spots.
      if (behavior.random) {
        const idleMin = behavior.idleMin ?? 800;
        const idleMax = behavior.idleMax ?? 2400;
        const minY = Number(route.minY);
        const maxY = Number(route.maxY);
        const hasY = Number.isFinite(minY) && Number.isFinite(maxY) && maxY > minY;
        const speed = Math.max(1, Number(route.speed) || 20);

        if (state.target) {
          const dx = state.target.x - npc.x;
          const dy = hasY ? state.target.y - npc.y : 0;
          const distance = Math.hypot(dx, dy);

          if (distance < 1.5 || now >= state.phaseUntil) {
            if (distance < 1.5) {
              npc.x = Math.max(min, Math.min(max, state.target.x));
              if (hasY) {
                npc.y = Math.max(minY, Math.min(maxY, state.target.y));
              }
            }
            state.target = null;
            state.vx = 0;
            state.vy = 0;
            this.setNpcPhase(state, 'idle', now, randomInRange(idleMin, idleMax));
            return;
          }

          // Ease in and out instead of snapping to the target.
          const approach = Math.min(1, distance / 18);
          const desiredVx = (dx / distance) * speed * approach;
          const desiredVy = (dy / distance) * speed * approach;
          const acceleration = Math.max(1, speed * 3) * dt;
          state.vx += Math.max(-acceleration, Math.min(acceleration, desiredVx - state.vx));
          state.vy += Math.max(-acceleration, Math.min(acceleration, desiredVy - state.vy));
          npc.x = Math.max(min, Math.min(max, npc.x + state.vx * dt));
          if (hasY) {
            npc.y = Math.max(minY, Math.min(maxY, npc.y + state.vy * dt));
          }

          if (Math.abs(state.vx) > Math.abs(state.vy)) {
            state.facing = state.vx >= 0 ? 'right' : 'left';
          } else if (hasY) {
            state.facing = state.vy >= 0 ? 'down' : 'up';
          }
          state.phase = 'walk';
          state.animation = 'walk';
          state.moving = true;
          changed = true;
          return;
        }

        if (now >= state.nextDecisionAt) {
          if (Math.random() < Number(behavior.walkChance ?? 0.6)) {
            const targetX = randomInRange(min, max);
            const targetY = hasY ? randomInRange(minY, maxY) : npc.y;
            const dx = targetX - npc.x;
            const dy = targetY - npc.y;
            const distance = Math.hypot(dx, dy);
            if (distance < 12) {
              this.setNpcPhase(state, 'idle', now, randomInRange(idleMin, idleMax));
            } else {
              state.target = { x: targetX, y: targetY };
              state.vx = 0;
              state.vy = 0;
              state.facing = Math.abs(dx) >= Math.abs(dy)
                ? (dx > 0 ? 'right' : 'left')
                : (dy > 0 ? 'down' : 'up');
              this.setNpcPhase(state, 'walk', now, (distance / speed) * 1000 + 400);
            }
          } else {
            this.setNpcPhase(state, 'idle', now, randomInRange(idleMin, idleMax));
          }
        } else {
          state.animation = state.idleKind;
          state.moving = false;
        }
        return;
      }

      if (now >= state.phaseUntil) {
        state.phase = nextNpcAnimation(state.phase);
        state.phaseStart = now;
        state.phaseUntil = now + durations[state.phase];
        state.animation = state.phase;
        state.animationStart = now;
      }

      state.moving = state.phase === 'walk';
      if (!state.moving) {
        return;
      }
      state.facing = state.dir < 0 ? 'left' : 'right';

      const speed = Number(route.speed) || 20;
      let x = npc.x + state.dir * speed * dt;
      if (x <= min) {
        x = min;
        state.dir = 1;
        state.facing = 'right';
      } else if (x >= max) {
        x = max;
        state.dir = -1;
        state.facing = 'left';
      }

      if (x !== npc.x) {
        npc.x = x;
        changed = true;
      }
    });

    if (changed) {
      this.solids = this.npcs.map((npc) => this.npcBox(npc));
      this.dirty = true;
    }
  }

  /** Set an NPC phase and its next decision time without restarting it every frame. */
  setNpcPhase(state, phase, now, duration) {
    state.phase = phase;
    state.phaseStart = now;
    state.phaseUntil = now + duration;
    state.nextDecisionAt = state.phaseUntil;
    if (phase === 'idle') {
      // Each pause is either plain standing or a "thinking" pose, at random.
      state.idleKind = Math.random() < state.thinkChance ? 'think' : 'idle';
    }
    state.animation = phase === 'idle' ? state.idleKind : phase;
    state.animationStart = now;
    state.moving = phase === 'walk';
  }

  /** Make an NPC briefly use its talking animation, then resume its cycle. */
  talkToNpc(npc) {
    const index = this.npcs.indexOf(npc);
    if (index < 0) {
      return;
    }
    const state = this.npcStates[index];
    const now = performance.now();
    let duration = npcTiming(npc).talk;

    // Turn towards the player and say the next line (cycled on each interaction).
    const dx = this.player.x - npc.x;
    const dy = this.player.y - npc.y;
    state.facing = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    const lines = Array.isArray(npc.lines) ? npc.lines : [];
    if (lines.length) {
      state.say = String(lines[state.lineIndex % lines.length]);
      state.lineIndex += 1;
      duration = Math.max(duration, 1400 + state.say.length * 55);
    }
    const extension = state.talkUntil > now ? state.talkUntil - now : duration;

    state.talkUntil = now + duration;
    if (state.phaseUntil > now) {
      state.phaseUntil += extension;
    }
    if (state.nextDecisionAt > now) {
      state.nextDecisionAt += extension;
    }
    state.animation = 'talk';
    state.animationStart = now;
    state.moving = false;
    state.vx = 0;
    state.vy = 0;
    this.dirty = true;
  }

  checkDoors(now) {
    const feet = this.feetBox();
    const touching = this.doors.find((door) => intersects(feet, door.rect)) ?? null;

    if (this.doorLock && (!touching || touching.id !== this.doorLock)) {
      this.doorLock = null;
    }
    if (!touching || this.doorBusy || this.doorLock || now < this.doorCooldownUntil) {
      return;
    }

    this.doorLock = touching.id;
    this.doorBusy = true;
    Promise.resolve(this.onDoor(touching))
      .catch((error) => console.error(error))
      .finally(() => {
        if (!this.destroyed) {
          this.doorBusy = false;
        }
      });
  }

  /** Server denied the door: show its message and push the player back. */
  denyDoor(door, message) {
    const center = rectCenter(door.rect);
    let dx = this.player.x - center.x;
    let dy = this.player.y - center.y;
    if (dx === 0 && dy === 0) {
      const back = { up: { x: 0, y: 1 }, down: { x: 0, y: -1 }, left: { x: 1, y: 0 }, right: { x: -1, y: 0 } };
      ({ x: dx, y: dy } = back[this.facing] ?? back.down);
    }
    const length = Math.hypot(dx, dy) || 1;
    this.player.x = clamp(this.player.x + (dx / length) * 24, 0, this.map.width);
    this.player.y = clamp(this.player.y + (dy / length) * 24, 0, this.map.height);
    this.doorCooldownUntil = performance.now() + DOOR_COOLDOWN;
    this.setMessage(message || 'Accès refusé.', 2600);
    this.dirty = true;
  }

  setMessage(text, duration = 2200) {
    this.hintText = text;
    this.hintUntil = performance.now() + duration;
    this.onHint?.(text);
    this.dirty = true;
  }

  updateHint(now, force = false) {
    if (!force && now < this.hintUntil) {
      return;
    }

    const target = this.findTarget();
    const text = target ? `[E] ${target.title}` : '';
    if (force || text !== this.hintText || target?.id !== this.target?.id) {
      this.target = target;
      this.hintText = text;
      this.onHint?.(text);
      this.dirty = true;
    }
  }

  feetBox() {
    return this.character.feetBox(this.player.x, this.player.y);
  }

  reachRect() {
    const feet = this.feetBox();
    const reach = this.character.reach;
    const pad = 8;

    switch (this.facing) {
      case 'up':
        return { x: feet.x - pad, y: feet.y - reach, w: feet.w + pad * 2, h: reach };
      case 'down':
        return { x: feet.x - pad, y: feet.y + feet.h, w: feet.w + pad * 2, h: reach };
      case 'left':
        return { x: feet.x - reach, y: feet.y - pad, w: reach, h: feet.h + pad * 2 };
      default:
        return { x: feet.x + feet.w, y: feet.y - pad, w: reach, h: feet.h + pad * 2 };
    }
  }

  npcBox(npc) {
    return {
      x: npc.x - NPC_SOLID.w / 2,
      y: npc.y - NPC_SOLID.h / 2,
      w: NPC_SOLID.w,
      h: NPC_SOLID.h,
    };
  }

  interactableTitle(interactable) {
    return interactable.label
      ?? INTERACTABLE_TITLES[interactable.kind]
      ?? humanize(interactable.id);
  }

  findTarget() {
    const reach = this.reachRect();
    const candidates = [];

    for (const slot of this.slots) {
      const object = this.objectsBySlot.get(slot.id);
      if (!object || !intersects(reach, slot.rect)) {
        continue;
      }
      candidates.push({
        kind: 'slot',
        id: `slot:${slot.id}`,
        title: object.titre,
        object,
        slot,
        point: rectCenter(slot.rect),
      });
    }

    for (const interactable of this.interactables) {
      if (!intersects(reach, interactable.rect)) {
        continue;
      }
      candidates.push({
        kind: 'interactable',
        id: `interactable:${interactable.id}`,
        title: this.interactableTitle(interactable),
        data: interactable,
        point: rectCenter(interactable.rect),
      });
    }

    for (const npc of this.npcs) {
      if (!intersects(reach, this.npcBox(npc))) {
        continue;
      }
      candidates.push({
        kind: 'npc',
        id: `npc:${npc.id}`,
        title: npc.name ?? humanize(npc.id),
        data: npc,
        point: { x: npc.x, y: npc.y },
      });
    }

    candidates.sort((a, b) => (
      distanceSq(this.player.x, this.player.y, a.point.x, a.point.y)
      - distanceSq(this.player.x, this.player.y, b.point.x, b.point.y)
    ));

    return candidates[0] ?? null;
  }

  interactTarget() {
    this.target = this.findTarget();
    return this.target;
  }

  neighborMapIds() {
    return [...new Set(this.doors.map((door) => door.to))].filter((id) => id !== this.map.id);
  }

  fadeTo(target, duration = FADE_DURATION) {
    return new Promise((resolve) => {
      this.fadeState = {
        from: this.fadeAlpha,
        to: target,
        start: performance.now(),
        duration,
        resolve,
      };
      this.dirty = true;
    });
  }

  fadeOut() {
    return this.fadeTo(1);
  }

  fadeIn() {
    return this.fadeTo(0);
  }

  updateFade(now) {
    const state = this.fadeState;
    if (!state) {
      return;
    }

    const progress = Math.min(1, (now - state.start) / state.duration);
    this.fadeAlpha = state.from + (state.to - state.from) * progress;
    this.dirty = true;

    if (progress >= 1) {
      this.fadeAlpha = state.to;
      this.fadeState = null;
      state.resolve();
    }
  }

  render() {
    if (!this.dirty || this.destroyed) {
      return;
    }
    this.dirty = false;

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#12141c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.camera.apply(ctx);
    ctx.imageSmoothingEnabled = false;
    if (this.image) {
      ctx.drawImage(this.image, 0, 0, this.map.width, this.map.height);
    }

    this.drawTargetHighlight(ctx);

    const drawables = [];
    for (const slot of this.slots) {
      const object = this.objectsBySlot.get(slot.id);
      if (object) {
        drawables.push({
          y: slot.rect.y + slot.rect.h,
          draw: () => this.drawObject(ctx, slot, object),
        });
      }
    }
    this.npcs.forEach((npc, index) => {
      drawables.push({ y: npc.y, draw: () => this.drawNpc(ctx, npc, index) });
    });
    drawables.push({
      y: this.player.y,
      draw: () => this.character.draw(
        ctx,
        this.facing,
        this.moving ? this.walkStep : this.idleStep,
        this.player.x,
        this.player.y,
      ),
    });

    drawables.sort((a, b) => a.y - b.y);
    for (const drawable of drawables) {
      drawable.draw();
    }

    this.drawSpeechBubbles(ctx);

    if (this.debug) {
      drawDebugOverlay(ctx, this);
    }
    // The editor draws in room coordinates on the same transformed canvas.
    this.overlay?.(ctx);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.debug && this.mouse) {
      ctx.fillStyle = 'rgba(0, 0, 0, .65)';
      ctx.fillRect(8, 8, 190, 22);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`x: ${Math.round(this.mouse.x)}  y: ${Math.round(this.mouse.y)}`, 14, 19);
    }

    if (this.fadeAlpha > 0) {
      ctx.globalAlpha = this.fadeAlpha;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
  }

  drawTargetHighlight(ctx) {
    if (!this.target) {
      return;
    }

    ctx.save();
    ctx.lineWidth = 2 / this.camera.scale;
    ctx.strokeStyle = 'rgba(252, 211, 77, .9)';
    const rect = this.target.slot?.rect ?? this.target.data?.rect ?? null;
    if (rect) {
      ctx.strokeRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
    }
    ctx.restore();
  }

  drawObject(ctx, slot, object) {
    const center = rectCenter(slot.rect);
    const style = STATE_STYLES[object.etat] ?? STATE_STYLES.verrouille;
    const size = 24;

    ctx.save();
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = 2 / this.camera.scale;
    ctx.beginPath();
    ctx.roundRect(center.x - size / 2, center.y - size / 2, size, size, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(OBJECT_GLYPHS[object.typeObjet] ?? '?', center.x, center.y + 1);
    ctx.restore();
  }

  drawNpc(ctx, npc, index = 0) {
    const state = this.npcStates[index];
    const now = performance.now();
    const direction = state?.dir ?? 1;
    const animation = state?.animation ?? 'idle';

    if (npc.atlas && this.drawNpcAtlas(ctx, npc, state, animation, now)) {
      return;
    }

    let key = npc.spriteIdle ?? npc.sprite;
    if (animation === 'walk') {
      const facing = state?.facing ?? (direction < 0 ? 'left' : 'right');
      key = npc[NPC_FACING_SPRITES[facing]]
        ?? npc.spriteDown
        ?? npc.spriteWalk
        ?? npc.sprite;
    } else if (animation === 'talk') {
      key = npc.spriteTalk ?? npc.sprite;
    }

    const sprite = this.sprites[key] ?? this.sprites[npc.sprite];
    if (sprite) {
      const scale = npc.scale ?? 2;
      const frames = typeof npc.frames === 'object'
        ? Math.max(1, Math.floor(npc.frames[animation] ?? 1))
        : Math.max(1, Math.floor(npc.frames ?? 1));
      const defaultFps = { idle: 1, walk: 5, talk: 5 }[animation] ?? 4;
      const fps = typeof npc.fps === 'object'
        ? (npc.fps[animation] ?? defaultFps)
        : (npc.fps ?? defaultFps);
      const frameWidth = sprite.naturalWidth / frames;
      const frameHeight = sprite.naturalHeight;
      const elapsed = Math.max(0, now - (state?.animationStart ?? now));
      const frame = frames > 1
        ? Math.floor((elapsed * fps) / 1000) % frames
        : 0;
      const width = frameWidth * scale;
      const height = frameHeight * scale;
      ctx.drawImage(
        sprite,
        frame * frameWidth, 0, frameWidth, frameHeight,
        npc.x - width / 2, npc.y - height, width, height,
      );
      return;
    }

    // Placeholder until a sprite exists for this NPC.
    ctx.save();
    ctx.fillStyle = '#7c5cff';
    ctx.beginPath();
    ctx.arc(npc.x, npc.y - 27, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(npc.x - 9, npc.y);
    ctx.lineTo(npc.x - 6, npc.y - 22);
    ctx.lineTo(npc.x + 6, npc.y - 22);
    ctx.lineTo(npc.x + 9, npc.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * One PNG for the whole NPC: columns = animation frames, rows = animation x direction
   * (order given by npc.atlas.anims / npc.atlas.dirs). Feet sit on the bottom of the cell.
   */
  drawNpcAtlas(ctx, npc, state, animation, now) {
    const sheet = this.sprites[npc.sprite];
    if (!sheet) {
      return false;
    }
    const atlas = npc.atlas;
    const cw = atlas.w ?? 48;
    const ch = atlas.h ?? 48;
    const anims = atlas.anims ?? NPC_ATLAS_ANIMS;
    const dirs = atlas.dirs ?? NPC_ATLAS_DIRS;
    const animIndex = Math.max(0, anims.indexOf(animation));
    const dirIndex = Math.max(0, dirs.indexOf(state?.facing ?? 'down'));
    const frames = Math.max(1, Math.floor(npc.frames?.[animation] ?? 1));
    const defaultFps = { idle: 1, walk: 6, talk: 4, think: 1 }[animation] ?? 4;
    const fps = npc.fps?.[animation] ?? defaultFps;
    const elapsed = Math.max(0, now - (state?.animationStart ?? now));
    const frame = frames > 1 ? Math.floor((elapsed * fps) / 1000) % frames : 0;
    const scale = npc.scale ?? 2;
    ctx.drawImage(
      sheet,
      frame * cw, (animIndex * dirs.length + dirIndex) * ch, cw, ch,
      npc.x - (cw * scale) / 2, npc.y - ch * scale, cw * scale, ch * scale,
    );
    return true;
  }

  /** Speech bubbles are drawn last, above every sprite, in room coordinates. */
  drawSpeechBubbles(ctx) {
    this.npcs.forEach((npc, index) => {
      const state = this.npcStates[index];
      if (!state?.say || state.animation !== 'talk') {
        return;
      }
      const scale = npc.scale ?? 2;
      const headY = npc.y - ((npc.atlas?.h ?? 48) - 4) * scale;

      ctx.save();
      const fontSize = 20;
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      // Word-wrap to a maximum width.
      const maxWidth = 280;
      const lines = [];
      let line = '';
      for (const word of state.say.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(test).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) {
        lines.push(line);
      }

      const pad = 12;
      const lineH = fontSize * 1.3;
      const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const w = textW + pad * 2;
      const h = lines.length * lineH + pad * 2 - 4;
      const x = Math.max(8, Math.min(this.map.width - w - 8, npc.x - w / 2));
      const y = Math.max(8, headY - h - 14);
      const r = 10;

      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      // tail pointing at the NPC's head
      const tx = Math.max(x + r + 8, Math.min(x + w - r - 8, npc.x));
      ctx.moveTo(tx - 8, y + h);
      ctx.lineTo(tx, y + h + 12);
      ctx.lineTo(tx + 8, y + h);
      ctx.fillStyle = '#fffdf6';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#2b2140';
      ctx.stroke();

      ctx.fillStyle = '#2b2140';
      lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad - 2 + i * lineH));
      ctx.restore();
    });
  }

  destroy() {
    this.destroyed = true;
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
  }
}
