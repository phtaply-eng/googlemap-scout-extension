'use strict';

/*
 * TapVinci Color Thief — standalone web UI
 * Reads the palette engine from script.js and renders the frosted-glass panel.
 */

const TAILWIND_SHADES = [50, 100, 300, 600, 700];
const DERMATOLOGY_COLORS = ['#FFFBF7', '#8FA89B', '#C2A878'];
const COPY_ICON = `
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <rect x="7" y="7" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"></rect>
    <path d="M12.8 7V5.4A1.4 1.4 0 0 0 11.4 4H5.4A1.4 1.4 0 0 0 4 5.4v6a1.4 1.4 0 0 0 1.4 1.4H7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"></path>
  </svg>
`;

const state = {
  colors: [],
  suggestion: null,
  busy: false,
  statusTimer: null
};

const elements = {};

if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', init, { once: true });
}

async function init() {
  cacheElements();
  bindEvents();
  elements.pageHost.textContent = getPageLabel();
  elements.pageHost.title = getPageLabel();
  await scanPage();
}

function cacheElements() {
  elements.pageHost = document.getElementById('pageHost');
  elements.palette = document.getElementById('palette');
  elements.emptyState = document.getElementById('emptyState');
  elements.emptyTitle = document.getElementById('emptyTitle');
  elements.emptyBody = document.getElementById('emptyBody');
  elements.emptyPick = document.getElementById('emptyPick');
  elements.suggestion = document.getElementById('suggestion');
  elements.suggestionReason = document.getElementById('suggestionReason');
  elements.suggestionSwatches = document.getElementById('suggestionSwatches');
  elements.copySuggestion = document.getElementById('copySuggestion');
  elements.copyTailwind = document.getElementById('copyTailwind');
  elements.copyCss = document.getElementById('copyCss');
  elements.refreshBtn = document.getElementById('refreshBtn');
  elements.eyedropperBtn = document.getElementById('eyedropperBtn');
  elements.status = document.getElementById('status');
  elements.scanMeta = document.getElementById('scanMeta');
}

function bindEvents() {
  elements.refreshBtn.addEventListener('click', () => scanPage({ manual: true }));
  elements.eyedropperBtn.addEventListener('click', pickColor);
  elements.copyTailwind.addEventListener('click', copyTailwind);
  elements.copyCss.addEventListener('click', copyCss);
  elements.copySuggestion.addEventListener('click', copySuggestionPalette);

  elements.palette.addEventListener('click', (event) => {
    const button = event.target.closest('.copy-color');
    if (!button) return;
    copyHex(button.dataset.hex, button);
  });

  elements.suggestionSwatches.addEventListener('click', (event) => {
    const button = event.target.closest('.suggestion-swatch');
    if (!button) return;
    copyHex(button.dataset.hex, button);
  });

  document.addEventListener('click', (event) => {
    const pickButton = event.target.closest('[data-action="pick"]');
    if (pickButton) pickColor();
  });
}

async function scanPage({ manual = false } = {}) {
  if (state.busy) return;

  state.busy = true;
  setBusy(true);
  renderSkeletons();
  elements.emptyState.classList.add('hidden');
  elements.suggestion.classList.add('hidden');
  elements.palette.classList.remove('hidden');
  setButtons(false);
  setStatus(manual ? 'Rescanning page…' : 'Scanning images…', 'busy');
  setScanMeta('Reading images…');

  try {
    if (!window.TapVinciPage || typeof window.TapVinciPage.extractPalette !== 'function') {
      throw new Error('Palette engine failed to load.');
    }

    const response = await window.TapVinciPage.extractPalette();
    if (!response || response.ok !== true) {
      throw new Error(response && response.error ? response.error : 'Could not scan this page.');
    }

    applyScanResult(response);
  } catch (error) {
    console.error('[TapVinci Color Thief]', error);
    showEmpty('Scan unavailable', friendlyError(error), true);
    setStatus('Could not scan this page', 'error');
    setScanMeta('Nothing scanned');
  } finally {
    state.busy = false;
    setBusy(false);
  }
}

function applyScanResult(response) {
  let colors = (Array.isArray(response.colors) ? response.colors : [])
    .map(normalizeHex)
    .filter(Boolean);

  if (colors.length) {
    colors = ensureFive(colors);
  }

  if (!colors.length) {
    showEmpty(
      'No images found',
      response.note || 'Try the eyedropper, or add images to the page and scan again.',
      true
    );
    setStatus('No usable images', 'error');
    setScanMeta('0 images');
    return;
  }

  state.colors = colors.slice(0, 5);
  state.suggestion = response.suggestion || null;

  elements.emptyState.classList.add('hidden');
  elements.palette.classList.remove('hidden');
  renderPalette(state.colors);
  renderSuggestion(state.suggestion);
  setButtons(true);

  const stats = response.stats || {};
  const imageLabel = `${stats.imagesUsed || 0} image${Number(stats.imagesUsed) === 1 ? '' : 's'}`;
  setScanMeta(`${state.colors.length} colors · ${imageLabel}`);
  setPageHost(response.page && response.page.host ? response.page.host : getPageLabel());
  setStatus(
    state.suggestion ? 'Smart match ready' : 'Palette ready',
    'success'
  );
}

function renderSkeletons() {
  elements.palette.classList.remove('hidden');
  elements.palette.innerHTML = Array.from({ length: 5 }, () => `
    <div class="color-row skeleton" aria-hidden="true">
      <span class="dot skeleton-dot"></span>
      <span class="skeleton-lines"><span></span><span></span></span>
      <span class="skeleton-copy"></span>
    </div>
  `).join('');
}

function renderPalette(colors) {
  elements.palette.innerHTML = colors.map((hex, index) => {
    const rgb = hexToRgb(hex);
    const rgbLabel = rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : '';

    return `
      <div class="color-row" style="--swatch:${hex};--i:${index}">
        <span class="dot" aria-hidden="true"></span>
        <span class="color-meta">
          <span class="hex">${hex}</span>
          <span class="rgb">${rgbLabel}</span>
        </span>
        <button class="copy-color" type="button" data-hex="${hex}" aria-label="Copy ${hex}" title="Copy ${hex}">
          ${COPY_ICON}
        </button>
      </div>
    `;
  }).join('');
}

function renderSuggestion(suggestion) {
  if (!suggestion || !Array.isArray(suggestion.colors) || !suggestion.colors.length) {
    elements.suggestion.classList.add('hidden');
    return;
  }

  elements.suggestionReason.textContent = suggestion.reason || 'Skin, sand & sage notes detected.';
  elements.suggestionSwatches.innerHTML = suggestion.colors.map((hex) => {
    const color = normalizeHex(hex);
    if (!color) return '';
    return `
      <button class="suggestion-swatch" type="button" data-hex="${color}" style="--swatch:${color}" title="Copy ${color}" aria-label="Copy ${color}">
        <span class="suggestion-dot" aria-hidden="true"></span>
        <span class="suggestion-hex">${color}</span>
      </button>
    `;
  }).join('');
  elements.suggestion.classList.remove('hidden');
}

function showEmpty(title, body, allowPick) {
  elements.palette.classList.add('hidden');
  elements.suggestion.classList.add('hidden');
  elements.emptyState.classList.remove('hidden');
  elements.emptyTitle.textContent = title;
  elements.emptyBody.textContent = body;
  elements.emptyPick.classList.toggle('hidden', !allowPick);
  setButtons(false);
}

async function copyHex(hex, button) {
  const color = normalizeHex(hex);
  if (!color) return;

  try {
    await copyText(color, `${color} copied`);
    if (button) {
      button.classList.add('copied');
      setTimeout(() => button.classList.remove('copied'), 900);
    }
  } catch (_error) {
    setStatus('Clipboard unavailable', 'error');
  }
}

async function copyTailwind() {
  if (!state.colors.length) return;
  try {
    await copyText(buildTailwindConfig(state.colors), 'Tailwind config copied');
  } catch (_error) {
    setStatus('Clipboard unavailable', 'error');
  }
}

async function copyCss() {
  if (!state.colors.length) return;
  try {
    await copyText(buildCssVariables(state.colors), 'CSS variables copied');
  } catch (_error) {
    setStatus('Clipboard unavailable', 'error');
  }
}

async function copySuggestionPalette() {
  if (!state.suggestion || !state.suggestion.colors) return;
  try {
    await copyText(state.suggestion.colors.join(', '), 'Dermatology palette copied');
  } catch (_error) {
    setStatus('Clipboard unavailable', 'error');
  }
}

async function pickColor() {
  if (!window.EyeDropper) {
    openNativeColorPicker();
    setStatus('Opening the color picker…', 'busy');
    return;
  }

  try {
    setStatus('Pick a color anywhere on screen…', 'busy');
    const result = await new window.EyeDropper().open();
    const hex = normalizeHex(result && result.sRGBHex);
    if (!hex) throw new Error('No color was returned.');
    applyPickedColor(hex);
  } catch (error) {
    if (error && error.name === 'AbortError') {
      setStatus('Color pick cancelled.');
      return;
    }

    // Fall back to the browser's native color input when EyeDropper is blocked.
    openNativeColorPicker();
    setStatus('Opening the color picker…', 'busy');
  }
}

function openNativeColorPicker() {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = '#C2A878';
  input.setAttribute('aria-hidden', 'true');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.opacity = '0';
  input.style.pointerEvents = 'none';

  const cleanup = () => {
    setTimeout(() => input.remove(), 0);
  };

  input.addEventListener('input', () => {
    applyPickedColor(input.value);
  });
  input.addEventListener('change', () => {
    applyPickedColor(input.value);
    cleanup();
  });
  input.addEventListener('blur', cleanup, { once: true });

  document.body.appendChild(input);
  input.click();
}

function applyPickedColor(hex) {
  const color = normalizeHex(hex);
  if (!color) return;

  if (!state.colors.length) {
    state.colors = ensureFive([color]);
    elements.emptyState.classList.add('hidden');
    elements.palette.classList.remove('hidden');
    renderPalette(state.colors);
    setButtons(true);
  } else {
    state.colors = ensureFive([color, ...state.colors.filter((existing) => existing !== color)]).slice(0, 5);
    renderPalette(state.colors);
  }

  if (!state.suggestion && isWarmNeutral(color)) {
    state.suggestion = {
      id: 'premium-dermatology',
      name: 'Premium Dermatology',
      tagline: 'Porcelain, sage & warm sand',
      colors: [...DERMATOLOGY_COLORS],
      reason: 'Picked tone fits the dermatology palette.'
    };
    renderSuggestion(state.suggestion);
  }

  setScanMeta(`${state.colors.length} colors · picked`);
  setStatus(`Picked ${color}`, 'success');
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_error) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Clipboard is unavailable.');
  }

  setStatus(message, 'success');
}

function setStatus(message, tone = '') {
  if (state.statusTimer) clearTimeout(state.statusTimer);
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;

  if (tone === 'success') {
    state.statusTimer = setTimeout(() => {
      elements.status.textContent = state.colors.length
        ? (state.suggestion ? 'Smart match ready' : 'Palette ready')
        : 'Ready';
      elements.status.dataset.tone = '';
    }, 2200);
  }
}

function setScanMeta(text) {
  elements.scanMeta.textContent = text;
}

function setPageHost(host) {
  const label = host || getPageLabel();
  elements.pageHost.textContent = label;
  elements.pageHost.title = label;
}

function setButtons(enabled) {
  elements.copyTailwind.disabled = !enabled;
  elements.copyCss.disabled = !enabled;
}

function setBusy(busy) {
  state.busy = busy;
  elements.refreshBtn.classList.toggle('scanning', busy);
  elements.refreshBtn.disabled = busy;
  elements.eyedropperBtn.disabled = busy;
}

function getPageLabel() {
  if (location.protocol === 'file:') return 'local demo';
  return location.hostname || 'demo page';
}

function friendlyError(error) {
  const message = error && error.message ? error.message : String(error);
  return message || 'Something went wrong while reading the page.';
}

/* -------------------------------------------------------------------------- */
/* Palette helpers                                                            */
/* -------------------------------------------------------------------------- */

function normalizeHex(value) {
  const raw = String(value || '').trim().replace(/^#/, '');
  const expanded = raw.length === 3
    ? raw.split('').map((character) => character + character).join('')
    : raw;
  return /^[0-9a-f]{6}$/i.test(expanded) ? `#${expanded.toUpperCase()}` : null;
}

function hexToRgb(value) {
  const hex = normalizeHex(value);
  if (!hex) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((channel) => Math.min(255, Math.max(0, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function ensureFive(input) {
  const palette = [];

  for (const value of input || []) {
    const hex = normalizeHex(value);
    if (!hex) continue;
    if (palette.includes(hex)) continue;
    palette.push(hex);
    if (palette.length >= 5) return palette;
  }

  if (!palette.length) return [];

  const bases = palette.slice();
  const shifts = [0.08, -0.08, 0.16, -0.16, 0.24, -0.24, 0.32, -0.32, 0.4, -0.4];
  let attempt = 0;

  while (palette.length < 5 && attempt < 100) {
    const base = bases[attempt % bases.length];
    const shift = shifts[Math.floor(attempt / bases.length) % shifts.length];
    const rgb = hexToRgb(base);

    if (rgb) {
      const target = shift > 0 ? 255 : 0;
      const amount = Math.abs(shift);
      const hex = rgbToHex(
        rgb.r + (target - rgb.r) * amount,
        rgb.g + (target - rgb.g) * amount,
        rgb.b + (target - rgb.b) * amount
      );

      if (!palette.includes(hex)) palette.push(hex);
    }

    attempt += 1;
  }

  return palette.slice(0, 5);
}

function getShadeEntries(colors) {
  const unique = [...new Set(colors.map(normalizeHex).filter(Boolean))]
    .sort((first, second) => relativeLuminance(second) - relativeLuminance(first));

  return unique.slice(0, 5).map((hex, index) => ({
    shade: TAILWIND_SHADES[index],
    hex
  }));
}

function buildTailwindConfig(colors) {
  const entries = getShadeEntries(colors)
    .map(({ shade, hex }) => `          ${shade}: '${hex}',`)
    .join('\n');

  return `// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
${entries}
        },
      },
    },
  },
};
`;
}

function buildCssVariables(colors) {
  const entries = getShadeEntries(colors)
    .map(({ shade, hex }) => `  --brand-${shade}: ${hex};`)
    .join('\n');

  return `:root {
${entries}
}
`;
}

function relativeLuminance(value) {
  const rgb = hexToRgb(value);
  if (!rgb) return 0;

  const channel = (component) => {
    const normalized = component / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function isWarmNeutral(value) {
  const rgb = hexToRgb(value);
  if (!rgb) return false;

  const red = rgb.r / 255;
  const green = rgb.g / 255;
  const blue = rgb.b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === red) {
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
    hue *= 60;
  }

  const skin = (
    rgb.r > rgb.g && rgb.g >= rgb.b && rgb.r - rgb.b >= 10 &&
    saturation >= 0.08 && saturation <= 0.75 &&
    lightness >= 0.16 && lightness <= 0.92 &&
    hue >= 0 && hue <= 55
  );
  const beige = (
    hue >= 20 && hue <= 65 &&
    saturation >= 0.04 && saturation <= 0.4 &&
    lightness >= 0.55 && lightness <= 0.97 &&
    rgb.r >= rgb.g && rgb.g >= rgb.b
  );
  const sage = (
    hue >= 60 && hue <= 170 &&
    saturation >= 0.04 && saturation <= 0.45 &&
    lightness >= 0.18 && lightness <= 0.86
  );

  return skin || beige || sage;
}
