import { Controller } from '@hotwired/stimulus';

const DIRECTIONS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  z: [0, -1], s: [0, 1], q: [-1, 0], d: [1, 0],
  w: [0, -1], a: [-1, 0],
};
const TILE_COLORS = ['#ddd', '#444', '#a60'];
const OBJECT_COLORS = { verrouille: '#888', disponible: '#fc0', resolu: '#2a2' };
const OBJECT_LETTERS = { terminal: 'T', coffre: 'C', porte: 'P', serveur: 'S' };

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
};

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
  static targets = ['canvas', 'title', 'hint', 'stage'];
  static values = { maps: Object, api: String, csrf: String, start: String };

  async connect() {
    this.ctx = this.canvasTarget.getContext('2d');
    this.mapCache = {};
    this.objects = [];
    this.loading = false;
    this.opening = false;
    this.overlay = null;
    this.onResize = () => this.fit();
    window.addEventListener('resize', this.onResize);
    this.onKey = (event) => this.handleKey(event);
    window.addEventListener('keydown', this.onKey);
    await this.loadMap(this.startValue, 7, 5);
  }

  disconnect() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
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

  async loadMap(id, x, y) {
    if (!this.mapsValue[id]) {
      console.error(`Unknown map: ${id}`);
      return;
    }
    this.loading = true;
    if (!this.mapCache[id]) {
      this.mapCache[id] = await (await fetch(this.mapsValue[id])).json();
    }
    this.map = this.mapCache[id];

    // Objects are NOT cached: their state will change as the player progresses.
    const result = await this.api(`/labs/${encodeURIComponent(id)}/objets`);
    this.objects = result.ok ? result.data.objets : [];

    const size = this.map.tileSize;
    this.canvasTarget.width = this.map.tiles[0].length * size;
    this.canvasTarget.height = this.map.tiles.length * size;
    this.player = { x, y };
    if (this.hasTitleTarget) this.titleTarget.textContent = this.map.name;

    this.loading = false;
    this.draw();
    this.updateHint();
  }

  fit() {
    if (!this.map) return;
    const size = this.map.tileSize;
    const cols = this.map.tiles[0].length;
    const rows = this.map.tiles.length;
    const availableW = this.stageTarget.clientWidth - 16;
    const availableH = this.stageTarget.clientHeight - 16;
    const zoom = Math.max(0.3, Math.min(availableW / (cols * size), availableH / (rows * size), 3));
    this.canvasTarget.style.width = `${Math.floor(cols * size * zoom)}px`;
    this.canvasTarget.style.height = `${Math.floor(rows * size * zoom)}px`;
  }
  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.element.requestFullscreen().catch((error) => console.error(error));
    }
  }

  

  // --- world helpers ---

  objectAt(x, y) {
    return this.objects.find((o) => o.posX === x && o.posY === y);
  }

  nearbyObject() {
    const { x, y } = this.player;
    return [[0, -1], [0, 1], [-1, 0], [1, 0]]
      .map(([dx, dy]) => this.objectAt(x + dx, y + dy))
      .find(Boolean);
  }

  setHint(text) {
    if (this.hasHintTarget) this.hintTarget.textContent = text;
  }

  updateHint() {
    const object = this.nearbyObject();
    this.setHint(object ? TEXT.interact(object.titre) : '');
  }

  interact() {
    const object = this.nearbyObject();
    if (!object) return;
    if (object.etat === 'verrouille') {
      this.setHint(TEXT.locked);
      return;
    }
    this.openChallenge(object);
  }

  // --- challenge window ---

  async openChallenge(object) {
    if (this.overlay || this.opening) return;
    this.opening = true;
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

  closeChallenge() {
    if (!this.overlay) return;
    this.overlay.remove();
    this.overlay = null;
    this.updateHint();
  }

  buildOverlay(challenge, object) {
    const overlay = el('div', 'game-overlay');
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) this.closeChallenge();
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

  async handleKey(event) {
    // While the window is open the game ignores the keyboard, so typing a flag
    // never moves the character. No preventDefault here: the input must still work.
    if (this.overlay) {
      if (event.key === 'Escape') this.closeChallenge();
      return;
    }
    if (this.loading) return;
    if (event.key === 'f' || event.key === 'F') {
      this.toggleFullscreen();
      return;
    }
    if (event.key === 'e' || event.key === 'E') {
      this.interact();
      return;
    }
    const direction = DIRECTIONS[event.key] ?? DIRECTIONS[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault();

    const nx = this.player.x + direction[0];
    const ny = this.player.y + direction[1];
    const row = this.map.tiles[ny];
    const tile = row ? row[nx] : undefined;
    const walkable = (tile === 0 || tile === 2) && !this.objectAt(nx, ny);

    if (walkable) {
      this.player = { x: nx, y: ny };
      if (tile === 2) {
        const door = (this.map.doors ?? []).find((d) => d.x === nx && d.y === ny);
        if (door) {
          await this.loadMap(door.to, door.spawnX, door.spawnY);
          return;
        }
      }
      this.draw();
      this.updateHint();
    }
  }

  // --- drawing: the only methods to change when you add real art ---

  draw() {
    this.drawMap();
    this.drawObjects();
    this.drawPlayer();
  }

  drawMap() {
    const size = this.map.tileSize;
    this.map.tiles.forEach((row, y) => row.forEach((tile, x) => {
      this.ctx.fillStyle = TILE_COLORS[tile];
      this.ctx.fillRect(x * size, y * size, size, size);
    }));
  }

  drawObjects() {
    const size = this.map.tileSize;
    this.ctx.font = 'bold 20px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.objects.forEach((o) => {
      this.ctx.fillStyle = OBJECT_COLORS[o.etat] ?? '#f0f';
      this.ctx.fillRect(o.posX * size + 4, o.posY * size + 4, size - 8, size - 8);
      this.ctx.fillStyle = '#000';
      this.ctx.fillText(OBJECT_LETTERS[o.typeObjet] ?? '?', o.posX * size + size / 2, o.posY * size + size / 2);
    });
  }

  drawPlayer() {
    const size = this.map.tileSize;
    this.ctx.fillStyle = '#c00';
    this.ctx.fillRect(this.player.x * size + 8, this.player.y * size + 8, size - 16, size - 16);
  }
}