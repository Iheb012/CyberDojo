// Dev-only map editor (F3). It edits the live map object used by EngineV2, so
// every change is visible immediately. Nothing here is available in prod: the
// controller checks APP_ENV and a server-side route before creating this class.

const LAYERS = [
  { id: 'wall', label: 'Mur', color: '#ef4444' },
  { id: 'door', label: 'Porte', color: '#4ade80' },
  { id: 'slot', label: 'Slot', color: '#60a5fa' },
  { id: 'interactable', label: 'Interactable', color: '#22d3ee' },
  { id: 'spawn', label: 'Spawn', color: '#facc15' },
];

const COLORS = Object.fromEntries(LAYERS.map((layer) => [layer.id, layer.color]));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   stage: HTMLElement,
 *   engine: object,
 *   maps: Record<string, string>,
 *   onClose?: Function,
 *   onStatus?: Function,
 * }} options
 */
export class MapEditor {
  constructor({ canvas, stage, engine, maps = {}, onClose, onStatus }) {
    this.canvas = canvas;
    this.stage = stage;
    this.engine = engine;
    this.maps = maps;
    this.onClose = onClose;
    this.onStatus = onStatus;

    this.layer = 'wall';
    this.selected = null;
    this.drag = null;
    this.preview = null;
    this.mouse = null;
    this.history = [];
    this.panel = null;
    this.listeners = [];
    this.fields = {};
  }

  get map() {
    return this.engine.map;
  }

  open() {
    this.engine.setEditing(true);
    this.engine.overlay = (ctx) => this.draw(ctx);
    this.buildPanel();
    this.listen(this.canvas, 'mousedown', (event) => this.onMouseDown(event));
    this.listen(this.canvas, 'mousemove', (event) => this.onMouseMove(event));
    this.listen(window, 'mouseup', (event) => this.onMouseUp(event));
    this.listen(this.canvas, 'contextmenu', (event) => event.preventDefault());
    this.status('F3 ferme l’éditeur · glisser : dessiner · clic : sélectionner · Suppr : effacer');
    this.engine.dirty = true;
  }

  close() {
    for (const [target, type, handler] of this.listeners) {
      target.removeEventListener(type, handler);
    }
    this.listeners = [];
    this.panel?.remove();
    this.panel = null;
    this.engine.overlay = null;
    this.engine.setEditing(false);
    this.onClose?.();
  }

  listen(target, type, handler) {
    target.addEventListener(type, handler);
    this.listeners.push([target, type, handler]);
  }

  status(text) {
    if (this.statusNode) this.statusNode.textContent = text;
    this.onStatus?.(text);
  }

  isTyping(target) {
    return target instanceof HTMLElement
      && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  }

  // --- history -----------------------------------------------------------

  pushHistory() {
    this.history.push(JSON.stringify(this.map));
    if (this.history.length > 50) this.history.shift();
  }

  undo() {
    const snapshot = this.history.pop();
    if (!snapshot) {
      this.status('Rien à annuler.');
      return;
    }
    this.engine.replaceMap(JSON.parse(snapshot));
    this.selected = null;
    this.syncForm();
    this.status('Modification annulée.');
  }

  // --- data helpers ------------------------------------------------------

  items(layer = this.layer) {
    if (layer === 'wall') return this.map.walls ?? (this.map.walls = []);
    if (layer === 'door') return this.map.doors ?? (this.map.doors = []);
    if (layer === 'slot') return this.map.slots ?? (this.map.slots = []);
    if (layer === 'interactable') return this.map.interactables ?? (this.map.interactables = []);
    return [];
  }

  bounds(item, layer = this.layer) {
    if (layer === 'wall') return item;
    return item?.rect ?? null;
  }

  setBounds(item, layer, rect) {
    if (layer === 'wall') {
      Object.assign(item, rect);
    } else {
      item.rect = rect;
    }
    this.engine.dirty = true;
  }

  label(item, layer, index) {
    if (layer === 'wall') return `mur ${index + 1}`;
    return item.id ?? `${layer} ${index + 1}`;
  }

  toWorld(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return this.engine.camera.screenToWorld(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    );
  }

  contains(rect, point) {
    return point.x >= rect.x && point.x <= rect.x + rect.w
      && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  hitTest(point) {
    const items = this.items();
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const rect = this.bounds(items[i]);
      if (rect && this.contains(rect, point)) {
        return { item: items[i], index: i, layer: this.layer, rect };
      }
    }
    return null;
  }

  handleAt(rect, point) {
    const tolerance = 10 / this.engine.camera.scale;
    const corners = [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x + rect.w, rect.y + rect.h],
      [rect.x, rect.y + rect.h],
    ];
    return corners.findIndex(([x, y]) => Math.abs(point.x - x) <= tolerance
      && Math.abs(point.y - y) <= tolerance);
  }

  // --- mouse -------------------------------------------------------------

  onMouseDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const point = this.toWorld(event);
    this.mouse = point;

    if (this.layer === 'spawn') {
      this.drag = {
        type: 'spawn', start: point, origin: { ...this.map.spawn }, changed: false,
      };
      return;
    }

    const hit = this.hitTest(point);
    if (hit) {
      this.selected = hit;
      this.drag = {
        type: this.handleAt(hit.rect, point) >= 0 ? 'resize' : 'move',
        handle: this.handleAt(hit.rect, point),
        rect: hit.rect,
        origin: { ...hit.rect },
        start: point,
        changed: false,
      };
    } else {
      this.selected = null;
      this.drag = { type: 'create', start: point, current: point };
    }
    this.syncForm();
    this.engine.dirty = true;
  }

  onMouseMove(event) {
    this.mouse = this.toWorld(event);
    const drag = this.drag;
    if (!drag) {
      this.engine.dirty = true;
      return;
    }

    const dx = this.mouse.x - drag.start.x;
    const dy = this.mouse.y - drag.start.y;
    const bounds = { w: this.map.width, h: this.map.height };

    if (drag.type === 'create') {
      this.preview = this.normalize(drag.start, this.mouse);
    } else if (drag.type === 'spawn') {
      if (!drag.changed && Math.hypot(dx, dy) > 1) {
        this.pushHistory();
        drag.changed = true;
      }
      if (drag.changed) {
        this.map.spawn = {
          x: Math.round(clamp(drag.origin.x + dx, 0, bounds.w)),
          y: Math.round(clamp(drag.origin.y + dy, 0, bounds.h)),
        };
      }
    } else if (drag.type === 'move') {
      if (!drag.changed && Math.hypot(dx, dy) > 1) {
        this.pushHistory();
        drag.changed = true;
      }
      if (drag.changed) {
        const rect = {
          x: Math.round(clamp(drag.origin.x + dx, 0, bounds.w - drag.rect.w)),
          y: Math.round(clamp(drag.origin.y + dy, 0, bounds.h - drag.rect.h)),
          w: drag.rect.w,
          h: drag.rect.h,
        };
        this.setBounds(this.selected.item, this.layer, rect);
        drag.rect = rect;
      }
    } else if (drag.type === 'resize') {
      if (!drag.changed && Math.hypot(dx, dy) > 1) {
        this.pushHistory();
        drag.changed = true;
      }
      if (drag.changed) {
        const rect = this.resize(drag.origin, drag.handle, this.mouse, bounds);
        this.setBounds(this.selected.item, this.layer, rect);
        drag.rect = rect;
      }
    }
    this.engine.dirty = true;
  }

  onMouseUp() {
    if (this.drag?.type === 'create') {
      const rect = this.preview;
      if (rect && rect.w >= 6 && rect.h >= 6) {
        this.pushHistory();
        const items = this.items();
        const item = this.createItem(items.length);
        this.setBounds(item, this.layer, rect);
        this.selected = { item, index: items.length - 1, layer: this.layer, rect };
        this.status(`${LAYERS.find((layer) => layer.id === this.layer).label} créé : ${rect.w}×${rect.h}`);
      } else {
        this.status('Glissez pour dessiner un rectangle (au moins 6×6 px).');
      }
    }
    this.drag = null;
    this.preview = null;
    this.syncForm();
    this.engine.dirty = true;
  }

  normalize(a, b) {
    return {
      x: Math.round(Math.min(a.x, b.x)),
      y: Math.round(Math.min(a.y, b.y)),
      w: Math.round(Math.abs(b.x - a.x)),
      h: Math.round(Math.abs(b.y - a.y)),
    };
  }

  resize(origin, handle, point, bounds) {
    const right = origin.x + origin.w;
    const bottom = origin.y + origin.h;
    let { x, y, w, h } = origin;

    if (handle === 0) {
      x = clamp(point.x, 0, right - 6);
      y = clamp(point.y, 0, bottom - 6);
      w = right - x;
      h = bottom - y;
    } else if (handle === 1) {
      y = clamp(point.y, 0, bottom - 6);
      w = clamp(point.x, origin.x + 6, bounds.w) - origin.x;
      h = bottom - y;
    } else if (handle === 2) {
      w = clamp(point.x, origin.x + 6, bounds.w) - origin.x;
      h = clamp(point.y, origin.y + 6, bounds.h) - origin.y;
    } else {
      x = clamp(point.x, 0, right - 6);
      w = right - x;
      h = clamp(point.y, origin.y + 6, bounds.h) - origin.y;
    }
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }

  createItem(index) {
    const id = `${this.layer}-${String(index + 1).padStart(2, '0')}`;
    if (this.layer === 'wall') {
      return { x: 0, y: 0, w: 10, h: 10 };
    }
    if (this.layer === 'door') {
      const to = Object.keys(this.maps)[0] ?? this.map.id;
      return { id, kind: 'door', to, facing: 'down', spawn: { x: 100, y: 100 }, rect: { x: 0, y: 0, w: 10, h: 10 } };
    }
    if (this.layer === 'slot') {
      return { id, rect: { x: 0, y: 0, w: 10, h: 10 } };
    }
    return { id, kind: 'info_board', label: id, rect: { x: 0, y: 0, w: 10, h: 10 } };
  }

  // --- keyboard ----------------------------------------------------------

  /** @returns {boolean} true when the key was consumed. */
  handleKey(event) {
    const key = event.key;
    if (key === 'Escape') {
      this.close();
      return true;
    }
    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'z') {
      this.undo();
      return true;
    }
    if (key === 'Delete' || key === 'Backspace') {
      this.deleteSelected();
      return true; // never let Backspace navigate away
    }
    if (key.startsWith('Arrow')) {
      const step = event.shiftKey ? 10 : 1;
      const dx = key === 'ArrowRight' ? step : key === 'ArrowLeft' ? -step : 0;
      const dy = key === 'ArrowDown' ? step : key === 'ArrowUp' ? -step : 0;
      this.nudge(dx, dy);
      return true;
    }
    return false;
  }

  deleteSelected() {
    if (this.layer === 'spawn') {
      this.status('Le spawn se déplace, il ne se supprime pas.');
      return true;
    }
    if (!this.selected) {
      return false;
    }
    this.pushHistory();
    this.items().splice(this.selected.index, 1);
    this.selected = null;
    this.syncForm();
    this.status('Élément supprimé (Ctrl+Z pour annuler).');
    return true;
  }

  nudge(dx, dy) {
    if (this.layer === 'spawn' || !this.selected) {
      return;
    }
    this.pushHistory();
    const rect = { ...this.bounds(this.selected.item) };
    rect.x = clamp(rect.x + dx, 0, this.map.width - rect.w);
    rect.y = clamp(rect.y + dy, 0, this.map.height - rect.h);
    this.setBounds(this.selected.item, this.layer, rect);
    this.selected.rect = rect;
    this.syncForm();
    this.engine.dirty = true;
  }

  // --- DOM form ----------------------------------------------------------

  buildPanel() {
    const panel = node('div', 'game-editor');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Éditeur de carte');
    panel.append(node('strong', 'game-editor-title', 'Éditeur de carte (dev)'));

    const layerRow = node('div', 'game-editor-row');
    const layerSelect = node('select');
    for (const layer of LAYERS) {
      const option = node('option', null, layer.label);
      option.value = layer.id;
      layerSelect.append(option);
    }
    layerSelect.addEventListener('change', () => this.setLayer(layerSelect.value));
    this.fields.layer = layerSelect;
    layerRow.append(node('label', null, 'Calque'), layerSelect);
    panel.append(layerRow);

    const grid = node('div', 'game-editor-grid');
    for (const [name, label, type] of [
      ['id', 'id', 'text'],
      ['kind', 'kind', 'text'],
      ['label', 'label', 'text'],
      ['to', 'to', 'text'],
      ['spawnX', 'spawn x', 'number'],
      ['spawnY', 'spawn y', 'number'],
      ['x', 'x', 'number'],
      ['y', 'y', 'number'],
      ['w', 'w', 'number'],
      ['h', 'h', 'number'],
    ]) {
      const input = node('input');
      input.type = type;
      input.dataset.field = name;
      input.addEventListener('change', () => this.applyField(name, input.value));
      this.fields[name] = input;
      const wrapper = node('label', 'game-editor-field');
      wrapper.append(node('span', null, label), input);
      grid.append(wrapper);
    }
    panel.append(grid);

    const actions = node('div', 'game-editor-actions');
    const copy = node('button', null, 'Copier le JSON');
    copy.type = 'button';
    copy.addEventListener('click', () => this.copyJson());
    const download = node('button', null, 'Télécharger');
    download.type = 'button';
    download.addEventListener('click', () => this.downloadJson());
    const undo = node('button', null, 'Annuler (Ctrl+Z)');
    undo.type = 'button';
    undo.addEventListener('click', () => this.undo());
    const close = node('button', null, 'Fermer (F3)');
    close.type = 'button';
    close.addEventListener('click', () => this.close());
    actions.append(copy, download, undo, close);
    panel.append(actions);

    this.statusNode = node('p', 'game-editor-status');
    this.statusNode.setAttribute('aria-live', 'polite');
    panel.append(this.statusNode);

    this.panel = panel;
    this.stage.append(panel);
    this.syncForm();
  }

  setLayer(layer) {
    if (!COLORS[layer]) return;
    this.layer = layer;
    this.selected = null;
    this.fields.layer.value = layer;
    this.syncForm();
    this.engine.dirty = true;
  }

  applyField(name, value) {
    if (this.layer === 'spawn') {
      if (name === 'x' || name === 'y' || name === 'spawnX' || name === 'spawnY') {
        this.pushHistory();
        const spawn = { ...(this.map.spawn ?? { x: 0, y: 0 }) };
        const key = name === 'x' || name === 'spawnX' ? 'x' : 'y';
        spawn[key] = Number(value) || 0;
        this.map.spawn = spawn;
        this.engine.dirty = true;
      }
      return;
    }
    if (!this.selected) return;

    if (['x', 'y', 'w', 'h'].includes(name)) {
      this.pushHistory();
      const rect = { ...this.bounds(this.selected.item) };
      rect[name] = Math.max(name === 'w' || name === 'h' ? 1 : 0, Number(value) || 0);
      this.setBounds(this.selected.item, this.layer, rect);
      this.selected.rect = rect;
      return;
    }

    if (name === 'spawnX' || name === 'spawnY') {
      const door = this.selected.item;
      if (!door.spawn) return;
      this.pushHistory();
      door.spawn = { ...door.spawn, [name === 'spawnX' ? 'x' : 'y']: Number(value) || 0 };
      this.engine.dirty = true;
      return;
    }

    if (['id', 'kind', 'label', 'to'].includes(name)) {
      this.pushHistory();
      this.selected.item[name] = value;
      this.engine.dirty = true;
    }
  }

  syncForm() {
    if (!this.panel) return;
    const spawnMode = this.layer === 'spawn';
    const selected = this.selected?.item ?? null;
    const rect = spawnMode
      ? { x: this.map.spawn?.x ?? 0, y: this.map.spawn?.y ?? 0, w: 0, h: 0 }
      : (this.selected?.rect ?? null);

    this.fields.layer.value = this.layer;
    this.fields.id.value = selected?.id ?? '';
    this.fields.kind.value = selected?.kind ?? '';
    this.fields.label.value = selected?.label ?? '';
    this.fields.to.value = selected?.to ?? '';
    this.fields.spawnX.value = selected?.spawn?.x ?? (spawnMode ? this.map.spawn?.x ?? 0 : '');
    this.fields.spawnY.value = selected?.spawn?.y ?? (spawnMode ? this.map.spawn?.y ?? 0 : '');
    this.fields.x.value = rect?.x ?? '';
    this.fields.y.value = rect?.y ?? '';
    this.fields.w.value = rect?.w ?? '';
    this.fields.h.value = rect?.h ?? '';

    const show = {
      id: !spawnMode && this.layer !== 'wall' && Boolean(selected),
      kind: this.layer === 'interactable' || this.layer === 'door',
      label: this.layer === 'interactable',
      to: this.layer === 'door',
      spawnX: this.layer === 'door' || spawnMode,
      spawnY: this.layer === 'door' || spawnMode,
      x: Boolean(rect),
      y: Boolean(rect),
      w: !spawnMode && Boolean(rect),
      h: !spawnMode && Boolean(rect),
    };
    for (const [name, input] of Object.entries(this.fields)) {
      if (name === 'layer') continue;
      input.parentElement.hidden = !show[name];
    }
  }

  async copyJson() {
    const json = JSON.stringify(this.map, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      this.status('JSON complet copié dans le presse-papiers.');
    } catch (error) {
      this.status('Copie impossible : autorisez le presse-papiers ou utilisez Télécharger.');
    }
  }

  downloadJson() {
    const blob = new Blob([JSON.stringify(this.map, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = node('a');
    link.href = url;
    link.download = `${this.map.id}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.status(`${link.download} téléchargé.`);
  }

  // --- canvas overlay ----------------------------------------------------

  draw(ctx) {
    const scale = this.engine.camera.scale;
    ctx.save();
    ctx.lineWidth = 2 / scale;
    ctx.font = `${12 / scale}px monospace`;
    ctx.textBaseline = 'top';

    for (const layer of LAYERS) {
      if (layer.id === 'spawn') continue;
      ctx.strokeStyle = layer.color;
      const items = this.items(layer.id);
      items.forEach((item, index) => {
        const rect = this.bounds(item, layer.id);
        if (!rect) return;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.fillStyle = layer.color;
        ctx.fillText(this.label(item, layer.id, index), rect.x, rect.y - 14 / scale);
      });
    }

    const spawn = this.map.spawn;
    if (spawn) {
      ctx.strokeStyle = COLORS.spawn;
      ctx.beginPath();
      ctx.arc(spawn.x, spawn.y, 12 / scale, 0, Math.PI * 2);
      ctx.moveTo(spawn.x - 18 / scale, spawn.y);
      ctx.lineTo(spawn.x + 18 / scale, spawn.y);
      ctx.moveTo(spawn.x, spawn.y - 18 / scale);
      ctx.lineTo(spawn.x, spawn.y + 18 / scale);
      ctx.stroke();
    }

    if (this.selected && !this.selected.rect) {
      this.selected.rect = this.bounds(this.selected.item);
    }
    if (this.selected?.rect) {
      const rect = this.selected.rect;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3 / scale;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = '#fff';
      const size = 8 / scale;
      for (const [x, y] of [
        [rect.x, rect.y], [rect.x + rect.w, rect.y],
        [rect.x + rect.w, rect.y + rect.h], [rect.x, rect.y + rect.h],
      ]) {
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }

    if (this.preview) {
      ctx.strokeStyle = COLORS[this.layer];
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(this.preview.x, this.preview.y, this.preview.w, this.preview.h);
      ctx.setLineDash([]);
    }

    if (this.mouse) {
      ctx.fillStyle = '#fff';
      ctx.fillText(
        `${Math.round(this.mouse.x)}, ${Math.round(this.mouse.y)}`,
        this.mouse.x + 10 / scale,
        this.mouse.y + 10 / scale,
      );
    }
    ctx.restore();
  }
}
