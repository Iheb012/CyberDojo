// Tiny visual check for the character descriptor: shows every row of every
// sheet, with the configured idle frame and feet hitbox outlined in yellow.
// Open /jeu/personnage-test in dev only.

const canvas = document.querySelector('[data-character-test]');
const configUrl = canvas?.dataset.config;
const status = document.querySelector('[data-character-test-status]');
const picker = document.querySelector('[data-character-test-variant]');

function drawLabel(ctx, text, x, y) {
  ctx.fillStyle = '#fff';
  ctx.font = '12px monospace';
  ctx.fillText(text, x, y);
}

async function main() {
  const response = await fetch(configUrl, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Character JSON: ${response.status}`);
  const config = await response.json();

  const images = new Map();
  await Promise.all(Object.values(config.variants).map((variant) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { images.set(variant.src, image); resolve(); };
    image.onerror = () => reject(new Error(`Sprite: ${variant.src}`));
    image.src = variant.src;
  })));

  function render(variantId) {
    const variant = config.variants[variantId] ?? config.variants[config.default];
    const image = images.get(variant.src);
    const scale = Number(variant.playerScale ?? variant.scale) || 1;
    const fw = variant.frameWidth * scale;
    const fh = variant.frameHeight * scale;
    const labelW = 80;
    const pad = 8;
    const rowNames = ['down', 'right', 'left', 'up'];

    canvas.width = labelW + 3 * fw + 4 * pad;
    canvas.height = 4 * (fh + pad) + pad;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#12141c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    rowNames.forEach((name, row) => {
      const y = pad + row * (fh + pad);
      drawLabel(ctx, name, 8, y + 20);
      if (variant.rows[name] === undefined) return;
      for (let column = 0; column < variant.walkCycle.length; column += 1) {
        const x = labelW + pad + column * (fw + pad);
        ctx.drawImage(
          image,
          column * variant.frameWidth,
          variant.rows[name] * variant.frameHeight,
          variant.frameWidth,
          variant.frameHeight,
          x, y, fw, fh,
        );
        ctx.strokeStyle = '#445';
        ctx.strokeRect(x + 0.5, y + 0.5, fw, fh);
        if (column === variant.walkCycle.indexOf(variant.idle)) {
          ctx.strokeStyle = '#fc0';
          ctx.strokeRect(x + 1.5, y + 1.5, fw - 3, fh - 3);
        }
      }
    });

    // Feet hitbox from the descriptor, drawn at frame scale for frame 0.
    const { w, h, offsetX, offsetY } = variant.hitbox;
    const x = labelW + pad;
    const y = pad;
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + offsetX * scale, y + offsetY * scale, w * scale, h * scale);
    status.textContent = `${variant.name ?? variantId}: rows down=${variant.rows.down}, right=${variant.rows.right}, left=${variant.rows.left}, up=${variant.rows.up}`;
  }

  for (const [id, variant] of Object.entries(config.variants)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = variant.name ?? id;
    picker.append(option);
  }
  picker.value = config.default;
  picker.addEventListener('change', () => render(picker.value));
  render(config.default);
}

main().catch((error) => {
  status.textContent = error.message;
  console.error(error);
});
