import { Controller } from '@hotwired/stimulus';
import { EngineV2 } from '../game/engine-v2.js';
import { Input } from '../game/input.js';
import { fetchMap, loadImage, preloadNeighbors } from '../game/map-loader.js';
import { loadCharacter } from '../game/character.js';
import { MapEditor } from '../game/map-editor.js';

const DIRECTIONS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  z: [0, -1], s: [0, 1], q: [-1, 0], d: [1, 0],
  w: [0, -1], a: [-1, 0],
};

// All player-facing texts in one place.
const TEXT = {
  interact: (title) => `[E] ${title}`,
  locked: 'Cet objet est verrouillé.',
  loadError: 'Impossible de charger le challenge.',
  download: 'Télécharger le fichier joint',
  hintButton: (cost) => `Indice (-${cost} pts)`,
  placeholder: 'CYBERDOJO{...}',
  submit: 'Valider',
  close: 'Fermer (Échap)',
  empty: 'Saisissez un flag.',
  tooMany: 'Trop d’essais. Attendez un peu avant de réessayer.',
  serverError: 'Erreur du serveur. Réessayez.',
  solved: 'Challenge déjà résolu ✓',
  accessDenied: 'Accès refusé.',
  loading: 'Chargement…',
  skinShop: 'Boutique de skins',
  skinEquip: 'Équiper',
  skinEquippedButton: '✓ Équipé',
  skinStatus: (name) => `Skin équipé : ${name}`,
  skinBought: (name) => `${name} acheté !`,
  skinPoor: 'Pas assez de pièces.',
  skinBuyLabel: (name, price) => `Acheter ${name} pour ${price} pièces`,
  skinClose: 'Fermer la boutique',
  skinExit: 'Quitter le terminal (E)',
};

// The shop wallet is local until the server has a wallet endpoint. Swap
// readCoins()/writeCoins() for API calls then; the shop UI does not change.
const WALLET_KEY = 'cyberdojo.coins';
const STARTING_COINS = 9999;
// Resolution of the skin previews (CSS scales them, pixelated).
const SKIN_PREVIEW = 128;

// Build DOM nodes with textContent only: never innerHTML with server text.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isSafeUrl(url) {
  return typeof url === 'string'
    && ((url.startsWith('/') && !url.startsWith('//')) || /^https?:\/\//i.test(url));
}

export default class extends Controller {
  static targets = ['canvas', 'title', 'hint', 'stage', 'progress', 'progressBar'];
  static values = {
    maps: Object,
    api: String,
    access: String,
    csrf: String,
    start: String,
    character: String,
    characterVariant: String,
    skinShop: String,
    coin: String,
    sprites: Object,
    debug: Boolean,
    editor: String,
  };

  async connect() {
    this.ctx = this.canvasTarget.getContext('2d');
    this.mapCache = {};
    this.objects = [];
    this.loading = false;
    this.opening = false;
    this.overlay = null;
    this.sprites = {};
    this.engine = null;
    this.input = new Input();
    this.frame = null;
    this.lastFrame = 0;
    this.debugEnabled = false;
    this.editor = null;
    this.ownedSkins = new Set(this.readOwnedSkins());
    this.coins = this.readCoins();

    this.onResize = () => this.fit();
    this.onKeyDown = (event) => this.handleKeyDown(event);
    this.onKeyUp = (event) => this.handleKeyUp(event);
    this.onBlur = () => this.input.clear();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);

    this.setProgress(0.05);
    try {
      if (this.characterValue) {
        this.character = await loadCharacter(
          this.characterValue,
          this.readSelectedSkin() ?? this.characterVariantValue ?? null,
        );
        await this.character.load();
      }
      this.sprites = await this.loadNpcSprites();
      await this.loadMap(this.startValue);
    } catch (error) {
      console.error(error);
      this.setHint(TEXT.loadError);
    }
  }

  disconnect() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.editor?.close();
    this.editor = null;
    this.engine?.destroy();
    this.engine = null;
  }

  // --- server communication: the server decides, the game only displays ---

  async api(path, { method = 'GET', body } = {}) {
    const headers = { Accept: 'application/json' };
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      headers['X-CSRF-Token'] = this.csrfValue;
    }
    const response = await fetch(`${this.apiValue}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      // empty or non-JSON body
    }
    return { status: response.status, ok: response.ok, data };
  }

  get accessBase() {
    if (this.accessValue) return this.accessValue;
    return `${this.apiValue.replace(/\/api\/jeu\/?$/, '')}/salles`;
  }

  // Skin purchases are local for now: no wallet endpoint exists yet.
  readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private mode or a full storage quota: the skin still changes this session.
    }
  }

  readOwnedSkins() {
    try {
      const ids = JSON.parse(this.readStorage('cyberdojo.skins.owned') ?? '[]');
      return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  readSelectedSkin() {
    return this.readStorage('cyberdojo.skin.selected');
  }

  readCoins() {
    const value = Number.parseInt(this.readStorage(WALLET_KEY) ?? '', 10);
    return Number.isFinite(value) && value >= 0 ? value : STARTING_COINS;
  }

  writeCoins(value) {
    this.coins = Math.max(0, Math.floor(value));
    this.writeStorage(WALLET_KEY, String(this.coins));
  }

  /** Load the NPC sprites declared by Twig; a missing one falls back to the engine placeholder. */
  async loadNpcSprites() {
    const sprites = {};
    await Promise.all(Object.entries(this.spritesValue ?? {}).map(async ([key, url]) => {
      try {
        sprites[key] = await loadImage(url);
      } catch (error) {
        console.warn(`Could not load NPC sprite ${key}`, error);
      }
    }));
    return sprites;
  }

  /** POST /salles/{id}/acces: the server decides if the door may be used. */
  async requestAccess(id) {
    try {
      const response = await fetch(`${this.accessBase}/${encodeURIComponent(id)}/acces`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': this.csrfValue,
        },
        credentials: 'same-origin',
        body: '{}',
      });
      let data = null;
      try {
        data = await response.json();
      } catch {
        // empty or non-JSON body
      }
      return { ok: response.ok, data };
    } catch (error) {
      console.error(error);
      return { ok: false, data: { message: TEXT.serverError } };
    }
  }

  // --- map loading: one engine, nine image rooms ---

  async loadMap(id, spawn = null, facing = null, { fadeAlpha = 0 } = {}) {
    if (!this.mapsValue[id]) {
      console.error(`Unknown map: ${id}`);
      return false;
    }

    this.loading = true;
    this.setProgress(0.15);
    try {
      const map = await fetchMap(this.mapsValue[id]);
      this.map = map;

      // Objects are NOT cached: their state changes as the player progresses.
      const result = await this.api(`/labs/${encodeURIComponent(id)}/objets`);
      this.objects = result.ok ? result.data.objets : [];
      this.setProgress(0.5);

      this.editor?.close();
      this.editor = null;
      this.engine?.destroy();
      this.engine = new EngineV2({
        canvas: this.canvasTarget,
        stage: this.stageTarget,
        map,
        objects: this.objects,
        character: this.character,
        input: this.input,
        sprites: this.sprites,
        debug: this.debugEnabled && this.debugValue,
        onHint: (text) => this.setHint(text),
        onDoor: (door) => this.handleDoor(door),
        onProgress: (value) => this.setProgress(0.5 + value * 0.45),
      });
      this.engine.fadeAlpha = fadeAlpha;
      await this.engine.load({ spawn, facing });

      if (this.hasTitleTarget) this.titleTarget.textContent = map.name;
      this.fit();
      this.engine.render();
      this.loading = false;
      this.setProgress(1);
      this.startLoop();

      // Warm the neighbouring rooms only after this one is on screen.
      preloadNeighbors(map, this.mapsValue).catch((error) => console.warn(error));
      return true;
    } catch (error) {
      console.error(error);
      this.loading = false;
      this.setHint(TEXT.loadError);
      return false;
    }
  }

  startLoop() {
    if (this.frame !== null) return;
    this.lastFrame = performance.now();
    const tick = (now) => {
      if (!this.engine) {
        this.frame = null;
        return;
      }
      const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      this.engine.update(dt, now);
      this.engine.render();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** Doors: fade out, ask the server, load and fade in; denied doors push back. */
  async handleDoor(door) {
    const result = await this.requestAccess(door.to);
    if (!result.ok || result.data?.autorise === false) {
      const message = result.data?.message ?? TEXT.accessDenied;
      if (this.engine?.denyDoor) this.engine.denyDoor(door, message);
      else this.setHint(message);
      return;
    }

    if (this.engine?.fadeOut) {
      await this.engine.fadeOut();
    }
    await this.loadMap(door.to, door.spawn, door.facing, { fadeAlpha: 1 });
    if (this.engine?.fadeIn) {
      await this.engine.fadeIn();
    }
  }

  fit() {
    this.engine?.resize();
  }

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.element.requestFullscreen().catch((error) => console.error(error));
    }
  }

  setProgress(value) {
    if (this.hasProgressBarTarget) {
      this.progressBarTarget.style.width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
    }
    if (this.hasProgressTarget) {
      this.progressTarget.classList.toggle('is-visible', value < 1);
    }
  }

  setHint(text) {
    if (this.hasHintTarget) this.hintTarget.textContent = text ?? '';
  }

  // --- interaction ---

  interact() {
    const target = this.engine?.interactTarget?.();
    if (!target) return;

    if (target.kind === 'slot') {
      const object = target.object;
      if (!object) return;
      if (object.etat === 'verrouille') {
        this.setHint(TEXT.locked);
        return;
      }
      this.openChallenge(object);
      return;
    }

    // NPCs acknowledge the interaction with their talking animation; fixed
    // objects show their title locally until their own endpoints exist.
    if (target.kind === 'npc') {
      this.engine.talkToNpc?.(target.data);
      return; // the NPC answers with a speech bubble instead of a HUD message
    }
    if (target.kind === 'interactable' && target.data?.id === 'cloths') {
      this.openSkinShop();
      return;
    }
    this.engine.setMessage?.(target.title ?? '');
  }

  async refreshObjects() {
    if (!this.map) return;
    const result = await this.api(`/labs/${encodeURIComponent(this.map.id)}/objets`);
    if (!result.ok) return;
    this.objects = result.data.objets;
    this.engine?.setObjects(this.objects);
    this.engine?.updateHint?.(performance.now(), true);
  }

  // --- skin shop (local wallet + unlocks until a server wallet exists) ---

  openSkinShop() {
    if (this.overlay || this.opening || !this.character) return;
    this.input.clear();
    this.overlay = this.buildSkinShop();
    this.element.appendChild(this.overlay);
  }

  /** Non-transparent bounds of a skin's standing frame, or null if unreadable. */
  skinFrameBounds(variant) {
    const image = this.character.images[variant.src];
    if (!image) return null;
    const fw = Number(variant.frameWidth) || 32;
    const fh = Number(variant.frameHeight) || fw;
    const sx = (Number(variant.idle) || 0) * fw;
    const sy = (Number(variant.rows?.down) || 0) * fh;
    try {
      const probe = document.createElement('canvas');
      probe.width = fw;
      probe.height = fh;
      const pctx = probe.getContext('2d', { willReadFrequently: true });
      pctx.drawImage(image, sx, sy, fw, fh, 0, 0, fw, fh);
      const { data } = pctx.getImageData(0, 0, fw, fh);
      let x0 = fw; let y0 = fh; let x1 = -1; let y1 = -1;
      for (let y = 0; y < fh; y += 1) {
        for (let x = 0; x < fw; x += 1) {
          if (data[(y * fw + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      return x1 < 0 ? null : { sx, sy, fw, fh, x0, y0, x1: x1 + 1, y1: y1 + 1 };
    } catch {
      return null; // tainted canvas: fall back to the whole frame
    }
  }

  buildSkinShop() {
    const overlay = el('div', 'game-overlay is-shop');
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) this.closeOverlay();
    });

    const panel = el('div', 'game-shop-panel');
    // The artwork is a real <img> (not a CSS background) so a failure is detectable.
    // If it cannot load, the shop stays usable with a plain frame and shows the URL it tried.
    const missingArt = (url) => {
      console.warn(`Skin shop artwork not found: ${url}`);
      panel.classList.add('no-art');
      panel.append(el('p', 'game-shop-missing', `Image introuvable : ${url || '(aucune URL)'}`));
    };
    if (this.skinShopValue) {
      const art = el('img', 'game-shop-art');
      art.alt = '';
      art.draggable = false;
      art.addEventListener('error', () => {
        art.remove();
        missingArt(this.skinShopValue);
      });
      art.src = this.skinShopValue;
      panel.append(art);
    } else {
      missingArt('');
    }

    // The artwork already draws the title, the coin box and "Exit Terminal":
    // transparent buttons sit on top of the drawn X and exit key.
    const closeX = el('button', 'game-shop-hit game-shop-close');
    closeX.type = 'button';
    closeX.setAttribute('aria-label', TEXT.skinClose);
    closeX.addEventListener('click', () => this.closeOverlay());
    const exit = el('button', 'game-shop-hit game-shop-exit');
    exit.type = 'button';
    exit.setAttribute('aria-label', TEXT.skinExit);
    exit.addEventListener('click', () => this.closeOverlay());

    const status = el('p', 'game-shop-status');
    status.setAttribute('aria-live', 'polite');
    const balanceBox = el('div', 'game-shop-balance');
    const balance = el('span');
    balanceBox.append(balance);
    const grid = el('div', 'game-shop-grid');
    panel.append(closeX, status, balanceBox, grid, exit);
    overlay.append(panel);

    const variants = Object.entries(this.character.config.variants)
      .filter(([, variant]) => variant.shop !== false);

    // One shared crop and scale so every skin is drawn at the same size.
    const bounds = variants.map(([, variant]) => this.skinFrameBounds(variant));
    const known = bounds.filter(Boolean);
    const box = known.length ? {
      x0: Math.min(...known.map((b) => b.x0)),
      y0: Math.min(...known.map((b) => b.y0)),
      x1: Math.max(...known.map((b) => b.x1)),
      y1: Math.max(...known.map((b) => b.y1)),
    } : null;

    const drawPreview = (canvas, variant, bound) => {
      const ctx = canvas.getContext('2d');
      const image = this.character.images[variant.src];
      if (!ctx || !image) return;
      ctx.imageSmoothingEnabled = false;
      const fw = Number(variant.frameWidth) || 32;
      const fh = Number(variant.frameHeight) || fw;
      const crop = box && bound
        ? { sx: bound.sx + box.x0, sy: bound.sy + box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0 }
        : { sx: 0, sy: 0, w: Math.min(fw, image.width), h: Math.min(fh, image.height) };
      const scale = Math.max(1, Math.floor(Math.min(SKIN_PREVIEW / crop.w, SKIN_PREVIEW / crop.h)));
      const w = crop.w * scale;
      const h = crop.h * scale;
      ctx.drawImage(
        image, crop.sx, crop.sy, crop.w, crop.h,
        Math.round((SKIN_PREVIEW - w) / 2), SKIN_PREVIEW - h, w, h,
      );
    };

    const cards = [];
    let flashTimer = null;
    const showStatus = () => {
      const selected = this.character.config.variants[this.character.variantId];
      status.textContent = TEXT.skinStatus(selected?.name ?? '');
    };
    const flash = (message) => {
      status.textContent = message;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flashTimer = null;
        showStatus();
      }, 2200);
    };
    const render = () => {
      cards.forEach((card) => card.update());
      balance.textContent = this.coins.toLocaleString('fr-FR');
      if (!flashTimer) showStatus();
    };

    variants.forEach(([id, variant], index) => {
      const name = variant.name ?? id;
      const price = Number(variant.price) || 0;

      const card = el('article', 'skin-card');
      const photo = el('div', 'skin-photo');
      const canvas = el('canvas', 'skin-thumb');
      canvas.width = SKIN_PREVIEW;
      canvas.height = SKIN_PREVIEW;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', name);
      drawPreview(canvas, variant, bounds[index]);
      photo.append(canvas);

      const info = el('div', 'skin-info');
      const label = el('span', 'skin-name', name);
      const action = el('button', 'skin-action');
      action.type = 'button';
      info.append(label, action);
      card.append(photo, info);

      const isOwned = () => price === 0 || this.ownedSkins.has(id);

      const update = () => {
        const equipped = this.character.variantId === id;
        const owned = isOwned();
        const poor = !owned && this.coins < price;
        card.classList.toggle('is-equipped', equipped);
        card.classList.toggle('is-owned', owned);
        action.classList.toggle('is-equipped', equipped);
        action.classList.toggle('is-owned', owned && !equipped);
        action.classList.toggle('is-buy', !owned);
        action.classList.toggle('is-poor', poor);
        action.disabled = equipped;
        action.removeAttribute('aria-label');
        if (equipped) {
          action.replaceChildren(TEXT.skinEquippedButton);
        } else if (owned) {
          action.replaceChildren(TEXT.skinEquip);
        } else {
          const coin = el('img', 'skin-coin');
          coin.alt = '';
          if (this.coinValue) coin.src = this.coinValue;
          action.replaceChildren(coin, el('span', 'skin-price', String(price)));
          action.setAttribute('aria-label', TEXT.skinBuyLabel(name, price));
        }
      };

      action.addEventListener('click', () => {
        let message = null;
        if (!isOwned()) {
          if (this.coins < price) {
            flash(TEXT.skinPoor);
            return;
          }
          this.writeCoins(this.coins - price);
          this.ownedSkins.add(id);
          this.writeStorage('cyberdojo.skins.owned', JSON.stringify([...this.ownedSkins]));
          message = TEXT.skinBought(name);
        }
        this.engine?.setVariant?.(id);
        this.writeStorage('cyberdojo.skin.selected', id);
        clearTimeout(flashTimer);
        flashTimer = null;
        render();
        if (message) flash(message);
      });

      cards.push({ update });
      grid.append(card);
    });

    render();
    return overlay;
  }

  // --- challenge window ---

  async openChallenge(object) {
    if (this.overlay || this.opening) return;
    this.opening = true;
    this.input.clear();
    try {
      const { status, ok, data } = await this.api(`/challenges/${object.id}`);
      if (status === 403) {
        this.setHint(TEXT.locked);
        return;
      }
      if (!ok) {
        this.setHint(TEXT.loadError);
        return;
      }
      this.overlay = this.buildOverlay(data, object);
      this.element.appendChild(this.overlay);
      const input = this.overlay.querySelector('input');
      if (input) input.focus();
    } catch (error) {
      console.error(error);
      this.setHint(TEXT.loadError);
    } finally {
      this.opening = false;
    }
  }

  closeOverlay() {
    if (!this.overlay) return;
    this.overlay.remove();
    this.overlay = null;
    this.input.clear();
    this.engine?.updateHint?.(performance.now(), true);
  }

  closeChallenge() {
    this.closeOverlay();
  }

  buildOverlay(challenge, object) {
    const overlay = el('div', 'game-overlay');
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) this.closeOverlay();
    });

    const panel = el('div', 'game-panel');
    panel.append(
      el('h2', null, challenge.titre),
      el('p', 'game-meta', `${challenge.difficulte} · ${challenge.points} points`),
      el('p', 'game-text', challenge.enonce),
    );

    if (isSafeUrl(challenge.fichierJoint)) {
      const link = el('a', null, TEXT.download);
      link.href = challenge.fichierJoint;
      link.target = '_blank';
      link.rel = 'noopener';
      panel.append(link);
    }

    const actions = el('div', 'game-actions');

    if (object.etat === 'resolu') {
      panel.append(el('p', 'game-message', TEXT.solved));
    } else {
      if (challenge.aIndice) {
        const hintBox = el('p', 'game-text');
        const hintButton = el('button', null, TEXT.hintButton(challenge.coutIndice ?? 0));
        hintButton.type = 'button';
        hintButton.addEventListener('click', async () => {
          hintButton.disabled = true;
          try {
            const { ok, data } = await this.api(`/challenges/${challenge.id}/indice`, { method: 'POST' });
            if (ok) hintBox.textContent = data.indice;
            else hintButton.disabled = false;
          } catch (error) {
            console.error(error);
            hintButton.disabled = false;
          }
        });
        panel.append(hintBox);
        actions.append(hintButton);
      }

      const form = el('form');
      const input = el('input');
      input.type = 'text';
      input.maxLength = 200;
      input.autocomplete = 'off';
      input.placeholder = TEXT.placeholder;
      const submit = el('button', null, TEXT.submit);
      submit.type = 'submit';
      const message = el('p', 'game-message');
      message.setAttribute('aria-live', 'polite');

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const flag = input.value.trim();
        if (flag === '') {
          message.className = 'game-message game-ko';
          message.textContent = TEXT.empty;
          return;
        }
        submit.disabled = true;
        try {
          const { status, data } = await this.api(`/challenges/${challenge.id}/flag`, {
            method: 'POST',
            body: { flag },
          });
          if (status === 429) {
            message.className = 'game-message game-ko';
            message.textContent = TEXT.tooMany;
          } else if (status === 200) {
            message.className = `game-message ${data.correct ? 'game-ok' : 'game-ko'}`;
            message.textContent = data.message;
            if (data.correct) this.refreshObjects().catch((error) => console.error(error));
          } else {
            message.className = 'game-message game-ko';
            message.textContent = data?.error ?? TEXT.serverError;
          }
        } catch (error) {
          console.error(error);
          message.className = 'game-message game-ko';
          message.textContent = TEXT.serverError;
        } finally {
          submit.disabled = false;
        }
      });

      form.append(input, submit);
      panel.append(form, message);
    }

    const closeButton = el('button', null, TEXT.close);
    closeButton.type = 'button';
    closeButton.addEventListener('click', () => this.closeChallenge());
    actions.append(closeButton);
    panel.append(actions);

    overlay.append(panel);
    return overlay;
  }

  // --- input ---

  /** F3: dev-only map editor, gated by APP_ENV on both sides. */
  async toggleEditor() {
    if (!this.debugValue) {
      return;
    }
    if (this.editor) {
      this.editor.close();
      this.editor = null;
      return;
    }
    if (this.overlay || this.loading || !this.engine) {
      return;
    }

    try {
      const response = await fetch(this.editorValue, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        return; // the route is 404 in prod, independently of the front flag
      }
      const data = await response.json();
      if (data.autorise !== true) {
        return;
      }
      this.input.clear();
      this.editor = new MapEditor({
        canvas: this.canvasTarget,
        stage: this.stageTarget,
        engine: this.engine,
        maps: this.mapsValue,
        onClose: () => {
          this.editor = null;
          this.input.clear();
        },
        onStatus: (text) => this.setHint(text),
      });
      this.editor.open();
    } catch (error) {
      console.error(error);
    }
  }

  handleKeyDown(event) {
    // While the window is open the game ignores the keyboard, so typing a flag
    // never moves the character. No preventDefault here: the input must work.
    if (this.overlay) {
      const exitShop = (event.key === 'e' || event.key === 'E')
        && !event.repeat
        && this.overlay.classList.contains('is-shop');
      if (event.key === 'Escape' || exitShop) this.closeOverlay();
      return;
    }

    if (event.key === 'F3') {
      event.preventDefault();
      this.toggleEditor().catch((error) => console.error(error));
      return;
    }

    if (this.editor) {
      if (this.editor.isTyping(event.target) && event.key !== 'Escape') {
        return;
      }
      if (this.editor.handleKey(event)) {
        event.preventDefault();
      }
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      this.debugEnabled = !this.debugEnabled;
      this.engine?.setDebug?.(this.debugEnabled && this.debugValue);
      return;
    }

    if (this.loading || !this.engine) return;
    if (event.key === 'f' || event.key === 'F') {
      this.toggleFullscreen();
      return;
    }
    if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
      this.interact();
      return;
    }

    const direction = DIRECTIONS[event.key] ?? DIRECTIONS[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault();
    this.input.press(event.key);
  }

  handleKeyUp(event) {
    this.input.release(event.key);
  }
}