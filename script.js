/*
 * TapVinci Color Thief — standalone web engine
 * Median-cut palette extraction, canvas sampling, and smart palette mapping.
 * Exposes globalThis.TapVinciPage.extractPalette() for details.js.
 */
(() => {
  'use strict';

  const DERMATOLOGY = Object.freeze({
    id: 'premium-dermatology',
    name: 'Premium Dermatology',
    tagline: 'Porcelain, sage & warm sand',
    colors: Object.freeze(['#FFFBF7', '#8FA89B', '#C2A878'])
  });

  const MAX_CANDIDATES = 18;
  const MAX_SIDE = 96;
  const MAX_PIXELS = 42000;
  const MIN_IMAGE_EDGE = 48;
  const IMAGE_LOAD_TIMEOUT = 5000;
  const MAX_SCAN_MS = 12000;
  const CANDIDATE_TIMEOUT = 6500;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function rgbToHex(r, g, b) {
    return `#${[r, g, b]
      .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}`;
  }

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

  function rgbToHsl(r, g, b) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
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

    return [hue, saturation, lightness];
  }

  function hslToRgb(hue, saturation, lightness) {
    const h = (((hue % 360) + 360) % 360) / 360;
    if (saturation === 0) {
      const value = Math.round(lightness * 255);
      return [value, value, value];
    }

    const q = lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;

    const hueToChannel = (t) => {
      let value = t;
      if (value < 0) value += 1;
      if (value > 1) value -= 1;
      if (value < 1 / 6) return p + (q - p) * 6 * value;
      if (value < 1 / 2) return q;
      if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
      return p;
    };

    return [
      Math.round(hueToChannel(h + 1 / 3) * 255),
      Math.round(hueToChannel(h) * 255),
      Math.round(hueToChannel(h - 1 / 3) * 255)
    ];
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

  function colorDistance(a, b) {
    const first = hexToRgb(a);
    const second = hexToRgb(b);
    if (!first || !second) return Number.POSITIVE_INFINITY;
    return Math.sqrt(
      (first.r - second.r) ** 2 +
      (first.g - second.g) ** 2 +
      (first.b - second.b) ** 2
    );
  }

  /* ----------------------------------------------------------------------- */
  /* Median-cut quantization                                                 */
  /* ----------------------------------------------------------------------- */

  function makeBox(items) {
    let minR = 255;
    let minG = 255;
    let minB = 255;
    let maxR = 0;
    let maxG = 0;
    let maxB = 0;
    let count = 0;

    for (const item of items) {
      if (item.r < minR) minR = item.r;
      if (item.g < minG) minG = item.g;
      if (item.b < minB) minB = item.b;
      if (item.r > maxR) maxR = item.r;
      if (item.g > maxG) maxG = item.g;
      if (item.b > maxB) maxB = item.b;
      count += item.count;
    }

    return {
      items,
      count,
      min: { r: minR, g: minG, b: minB },
      max: { r: maxR, g: maxG, b: maxB },
      range: Math.max(maxR - minR, maxG - minG, maxB - minB)
    };
  }

  function splitBox(box) {
    const ranges = [
      ['r', box.max.r - box.min.r],
      ['g', box.max.g - box.min.g],
      ['b', box.max.b - box.min.b]
    ].sort((first, second) => second[1] - first[1]);

    const channel = ranges[0][0];
    if (ranges[0][1] === 0) return null;

    const sorted = box.items.slice().sort((first, second) => first[channel] - second[channel]);
    const midpoint = box.count / 2;
    let accumulated = 0;
    let splitIndex = -1;

    for (let index = 0; index < sorted.length - 1; index += 1) {
      accumulated += sorted[index].count;
      if (accumulated >= midpoint) {
        splitIndex = index + 1;
        break;
      }
    }

    if (splitIndex <= 0 || splitIndex >= sorted.length) {
      splitIndex = Math.ceil(sorted.length / 2);
    }
    if (splitIndex <= 0) splitIndex = 1;
    if (splitIndex >= sorted.length) splitIndex = sorted.length - 1;

    return [
      makeBox(sorted.slice(0, splitIndex)),
      makeBox(sorted.slice(splitIndex))
    ];
  }

  function averageBox(box) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;

    for (const item of box.items) {
      red += item.r * item.count;
      green += item.g * item.count;
      blue += item.b * item.count;
      count += item.count;
    }

    if (!count) return null;

    const r = Math.round(red / count);
    const g = Math.round(green / count);
    const b = Math.round(blue / count);

    return {
      hex: rgbToHex(r, g, b),
      rgb: { r, g, b },
      count
    };
  }

  function quantizeHistogram(histogram, colorCount = 5) {
    if (!(histogram instanceof Map) || histogram.size === 0) return [];

    const entries = [];
    for (const [packed, count] of histogram) {
      if (!count) continue;
      entries.push({
        r: (packed >> 16) & 0xff,
        g: (packed >> 8) & 0xff,
        b: packed & 0xff,
        count
      });
    }

    if (!entries.length) return [];

    const boxes = [makeBox(entries)];

    while (boxes.length < colorCount) {
      let bestIndex = -1;
      let bestScore = -1;

      for (let index = 0; index < boxes.length; index += 1) {
        const box = boxes[index];
        if (box.items.length < 2 || box.range === 0) continue;

        const score = box.count * (box.range + 1);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }

      if (bestIndex === -1) break;

      const box = boxes.splice(bestIndex, 1)[0];
      const split = splitBox(box);
      if (!split) {
        boxes.push(box);
        break;
      }

      boxes.push(split[0], split[1]);
    }

    const merged = [];

    for (const box of boxes) {
      const color = averageBox(box);
      if (!color) continue;

      const near = merged.find((candidate) => colorDistance(candidate.hex, color.hex) < 8);
      if (!near) {
        merged.push(color);
        continue;
      }

      const total = near.count + color.count;
      const blended = {
        r: Math.round((near.rgb.r * near.count + color.rgb.r * color.count) / total),
        g: Math.round((near.rgb.g * near.count + color.rgb.g * color.count) / total),
        b: Math.round((near.rgb.b * near.count + color.rgb.b * color.count) / total)
      };

      near.rgb = blended;
      near.hex = rgbToHex(blended.r, blended.g, blended.b);
      near.count = total;
    }

    merged.sort((first, second) => second.count - first.count);
    return merged;
  }

  function ensurePaletteSize(input, colorCount = 5) {
    const palette = [];

    for (const value of input || []) {
      const hex = normalizeHex(value);
      if (!hex) continue;
      if (palette.some((existing) => colorDistance(existing, hex) < 6)) continue;
      palette.push(hex);
      if (palette.length >= colorCount) return palette;
    }

    if (!palette.length) return [];

    const bases = palette.slice();
    const shifts = [8, -8, 16, -16, 24, -24, 32, -32, 40, -40, 48, -48];
    let attempt = 0;

    while (palette.length < colorCount && attempt < 120) {
      const base = bases[attempt % bases.length];
      const shift = shifts[Math.floor(attempt / bases.length) % shifts.length];
      const rgb = hexToRgb(base);

      if (rgb) {
        const [hue, saturation, lightness] = rgbToHsl(rgb.r, rgb.g, rgb.b);
        const nextLightness = clamp(lightness + shift / 100, 0.08, 0.94);
        const [r, g, b] = hslToRgb(hue, saturation, nextLightness);
        const hex = rgbToHex(r, g, b);

        if (!palette.some((existing) => colorDistance(existing, hex) < 6)) {
          palette.push(hex);
        }
      }

      attempt += 1;
    }

    return palette.slice(0, colorCount);
  }

  /* ----------------------------------------------------------------------- */
  /* Smart palette detection                                                 */
  /* ----------------------------------------------------------------------- */

  function classifyColor(r, g, b) {
    const [hue, saturation, lightness] = rgbToHsl(r, g, b);
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

    const skin = (
      y >= 45 &&
      cb >= 72 && cb <= 130 &&
      cr >= 130 && cr <= 180 &&
      r > g && g >= b &&
      (r - b) >= 10 &&
      saturation >= 0.08 && saturation <= 0.75 &&
      lightness >= 0.16 && lightness <= 0.92 &&
      hue >= 0 && hue <= 55
    );

    const beige = (
      hue >= 20 && hue <= 65 &&
      saturation >= 0.04 && saturation <= 0.4 &&
      lightness >= 0.55 && lightness <= 0.97 &&
      r >= g && g >= b
    );

    const sage = (
      hue >= 60 && hue <= 170 &&
      saturation >= 0.04 && saturation <= 0.45 &&
      lightness >= 0.18 && lightness <= 0.86
    );

    return { skin, beige, sage };
  }

  function analyzeHistogram(histogram, palette = []) {
    let total = 0;
    let skin = 0;
    let beige = 0;
    let sage = 0;

    if (histogram instanceof Map) {
      for (const [packed, count] of histogram) {
        if (!count) continue;
        total += count;
        const match = classifyColor(
          (packed >> 16) & 0xff,
          (packed >> 8) & 0xff,
          packed & 0xff
        );
        if (match.skin) skin += count;
        if (match.beige) beige += count;
        if (match.sage) sage += count;
      }
    }

    const skinRatio = total ? skin / total : 0;
    const beigeRatio = total ? beige / total : 0;
    const sageRatio = total ? sage / total : 0;

    let paletteMatches = 0;
    for (const hex of palette) {
      const rgb = hexToRgb(hex);
      if (!rgb) continue;
      const match = classifyColor(rgb.r, rgb.g, rgb.b);
      if (match.skin || match.beige || match.sage) paletteMatches += 1;
    }

    const combinedRatio = skinRatio + beigeRatio + sageRatio;
    const suggest = total > 0 && (
      skinRatio >= 0.055 ||
      beigeRatio >= 0.1 ||
      sageRatio >= 0.085 ||
      (paletteMatches >= 2 && combinedRatio >= 0.06)
    );

    let reason = 'Warm neutral tones detected in the imagery.';
    if (skinRatio >= 0.055) {
      reason = 'Skin tones detected in the imagery.';
    } else if (beigeRatio >= 0.1) {
      reason = 'Warm beige notes detected in the imagery.';
    } else if (sageRatio >= 0.085) {
      reason = 'Soft sage notes detected in the imagery.';
    }

    return {
      total,
      skinRatio,
      beigeRatio,
      sageRatio,
      combinedRatio,
      paletteMatches,
      suggest,
      reason
    };
  }

  function getDermatologySuggestion() {
    return {
      id: DERMATOLOGY.id,
      name: DERMATOLOGY.name,
      tagline: DERMATOLOGY.tagline,
      colors: [...DERMATOLOGY.colors]
    };
  }

  /* ----------------------------------------------------------------------- */
  /* Page scanning                                                           */
  /* ----------------------------------------------------------------------- */

  async function extractPalette() {
    const candidates = collectCandidates();

    if (!candidates.length) {
      return {
        ok: true,
        colors: [],
        suggestion: null,
        stats: { imagesUsed: 0, imageCount: 0, pixels: 0, failures: 0 },
        page: getPageInfo(),
        note: 'No usable images were found on this page.'
      };
    }

    const histogram = new Map();
    const failures = [];
    const startedAt = performance.now();
    let pixels = 0;
    let imagesUsed = 0;

    for (const candidate of candidates) {
      if (pixels >= MAX_PIXELS || performance.now() - startedAt > MAX_SCAN_MS) break;

      const remaining = MAX_PIXELS - pixels;
      const result = await withTimeout(
        sampleCandidate(candidate, remaining),
        CANDIDATE_TIMEOUT
      );

      if (!result) {
        failures.push({ url: candidate.url, kind: candidate.kind, error: 'Image scan timed out.' });
        continue;
      }

      if (result.pixels && result.pixels.length) {
        for (const packed of result.pixels) {
          histogram.set(packed, (histogram.get(packed) || 0) + 1);
        }
        pixels += result.pixels.length;
        imagesUsed += 1;
      } else if (result.error) {
        failures.push({ url: candidate.url, kind: candidate.kind, error: result.error });
      }
    }

    if (!histogram.size) {
      return {
        ok: true,
        colors: [],
        suggestion: null,
        stats: {
          imagesUsed: 0,
          imageCount: candidates.length,
          pixels: 0,
          failures: failures.length
        },
        page: getPageInfo(),
        note: failures.length
          ? 'The images on this page could not be read.'
          : 'The images on this page had no visible pixels.'
      };
    }

    const quantized = quantizeHistogram(histogram, 5);
    const colors = ensurePaletteSize(quantized.map((color) => color.hex), 5);
    const analysis = analyzeHistogram(histogram, colors);
    const suggestion = analysis.suggest
      ? { ...getDermatologySuggestion(), reason: analysis.reason }
      : null;

    return {
      ok: true,
      colors,
      suggestion,
      analysis,
      stats: {
        imagesUsed,
        imageCount: candidates.length,
        pixels,
        failures: failures.length
      },
      page: getPageInfo()
    };
  }

  function collectCandidates() {
    const seen = new Set();
    const candidates = [];

    const add = (candidate) => {
      if (!candidate.url || seen.has(candidate.url)) return;
      seen.add(candidate.url);
      candidates.push(candidate);
    };

    for (const image of Array.from(document.images)) {
      const url = image.currentSrc || image.src;
      if (!url || !/^(https?:|data:image\/|blob:)/i.test(url)) continue;

      const naturalWidth = image.naturalWidth || 0;
      const naturalHeight = image.naturalHeight || 0;
      if (naturalWidth < MIN_IMAGE_EDGE || naturalHeight < MIN_IMAGE_EDGE) continue;

      const rect = image.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) continue;

      const style = getComputedStyle(image);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      ) {
        continue;
      }

      add({
        kind: 'image',
        url,
        element: image,
        area: Math.max(1, rect.width * rect.height),
        inViewport: isInViewport(rect)
      });
    }

    const backgroundNodes = document.querySelectorAll(
      '[style*="background-image"], header, section, main, [class*="hero"], [class*="banner"], [class*="cover"], [class*="background"]'
    );

    let inspected = 0;
    for (const element of backgroundNodes) {
      if (inspected >= 70) break;
      inspected += 1;

      const rect = element.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 80) continue;

      const style = getComputedStyle(element);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      ) {
        continue;
      }

      const background = style.backgroundImage;
      if (!background || background === 'none') continue;

      const match = background.match(/url\((['"]?)(.*?)\1\)/i);
      if (!match) continue;

      const url = match[2];
      if (!url || !/^(https?:|data:image\/|blob:)/i.test(url)) continue;

      add({
        kind: 'background',
        url,
        element: null,
        area: Math.max(1, rect.width * rect.height),
        inViewport: isInViewport(rect)
      });
    }

    return candidates
      .sort((first, second) => {
        if (first.inViewport !== second.inViewport) return first.inViewport ? -1 : 1;
        return second.area - first.area;
      })
      .slice(0, MAX_CANDIDATES);
  }

  async function sampleCandidate(candidate, maxPixels) {
    try {
      const source = candidate.element || await loadImage(candidate.url);
      const pixels = drawAndSample(source, maxPixels);
      if (pixels.length) return { pixels };
    } catch (_error) {
      // Cross-origin images taint the canvas. Try a CORS fetch below.
    }

    if (!/^https?:/i.test(candidate.url)) {
      return { pixels: [], error: 'Image could not be read.' };
    }

    try {
      const dataUrl = await fetchAsDataUrl(candidate.url);
      const image = await loadImage(dataUrl);
      return { pixels: drawAndSample(image, maxPixels) };
    } catch (error) {
      return {
        pixels: [],
        error: error && error.message ? error.message : String(error)
      };
    }
  }

  function withTimeout(promise, timeout) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(null);
      }, timeout);

      promise.then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            pixels: [],
            error: error && error.message ? error.message : String(error)
          });
        }
      );
    });
  }

  function drawAndSample(source, maxPixels) {
    const naturalWidth = source.naturalWidth || source.videoWidth || source.width;
    const naturalHeight = source.naturalHeight || source.videoHeight || source.height;

    if (!naturalWidth || !naturalHeight) {
      throw new Error('Image has no dimensions.');
    }

    const scale = Math.min(1, MAX_SIDE / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas is unavailable.');

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, width, height);

    const data = context.getImageData(0, 0, width, height).data;
    const total = width * height;
    const stride = Math.max(1, Math.ceil(total / Math.max(1, maxPixels)));
    const pixels = [];

    for (let index = 0; index < data.length; index += 4 * stride) {
      if (data[index + 3] < 140) continue;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      pixels.push((red << 16) | (green << 8) | blue);
    }

    return pixels;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      let timer = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
      };

      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => {
        cleanup();
        resolve(image);
      };
      image.onerror = () => {
        cleanup();
        reject(new Error('Image failed to load.'));
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new Error('Image load timed out.'));
      }, IMAGE_LOAD_TIMEOUT);

      image.src = url;
    });
  }

  async function fetchAsDataUrl(url) {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    });

    if (!response.ok) throw new Error(`Image request failed (${response.status}).`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('Image is empty.');

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Image could not be decoded.'));
      reader.readAsDataURL(blob);
    });
  }

  function isInViewport(rect) {
    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }

  function getPageInfo() {
    return {
      title: document.title,
      url: location.href,
      host: location.hostname || (location.protocol === 'file:' ? 'local demo' : 'page')
    };
  }

  globalThis.TapVinciColor = Object.freeze({
    DERMATOLOGY,
    rgbToHex,
    normalizeHex,
    hexToRgb,
    rgbToHsl,
    relativeLuminance,
    colorDistance,
    quantizeHistogram,
    ensurePaletteSize,
    classifyColor,
    analyzeHistogram,
    getDermatologySuggestion
  });

  globalThis.TapVinciPage = Object.freeze({
    extractPalette,
    getPageInfo
  });
})();
