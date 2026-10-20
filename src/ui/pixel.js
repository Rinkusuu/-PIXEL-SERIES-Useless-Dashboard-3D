/* ============================================================================
   pixel.js — the pixel-art drawing kit.

   Everything in the world is drawn into a small buffer (roughly 500×280) that
   is then blown up with `image-rendering: pixelated`. That means:

     · a "pixel" here is a real, chunky, visible pixel — so every coordinate
       must be an integer or the browser will anti-alias it into mush;
     · we can afford to be lavish (hundreds of particles, per-scanline water)
       because we're filling ~140k pixels, not 4 million.

   The sprite DSL lets us author pixel art as ASCII in the source file. No PNGs,
   no atlas, no 404s — and the palette can be swapped per-frame, which is how
   the same slime sprite gets lit differently at noon and at midnight.
   ========================================================================== */

import { rgbCss } from '../core/util.js';

/* ── Ordered dithering ────────────────────────────────────────────────────────
   The 4×4 Bayer matrix. Quantising a smooth gradient with a per-pixel threshold
   from this matrix is what produces the crosshatched colour transitions that
   read instantly as "16-bit sky" rather than "CSS linear-gradient".
   -------------------------------------------------------------------------- */
export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Quantise one channel with a dither threshold. `steps` = size of the ramp. */
function quant(v, threshold, steps) {
  const step = 255 / steps;
  return Math.min(255, Math.max(0, Math.round((v + (threshold - 0.5) * step) / step) * step));
}

/**
 * Render a vertical multi-stop gradient into an offscreen canvas with ordered
 * dithering, then return it. Callers cache this and only regenerate when the
 * palette has actually moved.
 *
 * `stops` — [{ at: 0..1, color: [r,g,b] }], must be sorted.
 */
export function ditherGradient(w, h, stops, steps = 22) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;

  for (let y = 0; y < h; y++) {
    const ty = y / (h - 1 || 1);

    // Locate the span this row falls in.
    let i = 0;
    while (i < stops.length - 2 && ty > stops[i + 1].at) i++;
    const s0 = stops[i];
    const s1 = stops[i + 1] || s0;
    const span = s1.at - s0.at || 1;
    const f = Math.min(1, Math.max(0, (ty - s0.at) / span));

    const r = s0.color[0] + (s1.color[0] - s0.color[0]) * f;
    const gg = s0.color[1] + (s1.color[1] - s0.color[1]) * f;
    const b = s0.color[2] + (s1.color[2] - s0.color[2]) * f;

    for (let x = 0; x < w; x++) {
      const th = BAYER4[y & 3][x & 3] / 16;
      const o = (y * w + x) * 4;
      d[o] = quant(r, th, steps);
      d[o + 1] = quant(gg, th, steps);
      d[o + 2] = quant(b, th, steps);
      d[o + 3] = 255;
    }
  }

  g.putImageData(img, 0, 0);
  return cv;
}

/* ── Primitives ──────────────────────────────────────────────────────────── */

/** Integer-snapped rect. Use this instead of fillRect, always. */
export function px(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/** A single pixel. */
export function dot(g, x, y, color, size = 1) {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), size, size);
}

/**
 * A soft radial "glow" made of concentric squares rather than a real gradient.
 * Drawn into the emissive buffer, where the CSS blur turns the steps into a
 * smooth halo — so the cheap version and the expensive version look identical.
 */
export function glowDot(g, x, y, radius, color, alpha = 1) {
  const steps = Math.max(1, Math.round(radius));
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    g.globalAlpha = alpha * (1 - t) * 0.5;
    const r = i;
    g.fillStyle = color;
    g.fillRect(Math.round(x - r), Math.round(y - r), r * 2, r * 2);
  }
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
  g.globalAlpha = 1;
}

/** A filled circle, but on the pixel grid — a proper pixel-art disc. */
export function pxCircle(g, cx, cy, r, color) {
  g.fillStyle = color;
  const R = Math.round(r);
  for (let y = -R; y <= R; y++) {
    // Half-pixel bias makes the silhouette read as round instead of octagonal.
    const w = Math.floor(Math.sqrt(Math.max(0, R * R - y * y)) + 0.5);
    if (w <= 0) continue;
    g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2, 1);
  }
}

/* ── Sprites ─────────────────────────────────────────────────────────────────
   Author art as ASCII. '.' or ' ' is transparent; any other character indexes
   into the palette map.

     makeSprite([
       '..aa..',
       '.aabb.',
       'aabbbb',
     ], { a: '#fff', b: '#f0a' })
   -------------------------------------------------------------------------- */

export function makeSprite(rows, palette, scale = 1) {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const cv = document.createElement('canvas');
  cv.width = w * scale;
  cv.height = h * scale;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;

  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return cv;
}

/** Draw a sprite canvas, snapped, optionally mirrored. */
export function drawSprite(g, sprite, x, y, { flip = false, alpha = 1 } = {}) {
  if (!sprite) return;
  const X = Math.round(x);
  const Y = Math.round(y);
  if (alpha !== 1) g.globalAlpha = alpha;

  if (flip) {
    g.save();
    g.translate(X + sprite.width, Y);
    g.scale(-1, 1);
    g.drawImage(sprite, 0, 0);
    g.restore();
  } else {
    g.drawImage(sprite, X, Y);
  }

  if (alpha !== 1) g.globalAlpha = 1;
}

/**
 * Recolour a sprite by multiplying it with a flat colour, preserving its alpha.
 * Used to light sprites with the scene palette and to build silhouettes.
 * Result is cached by the caller — this allocates a canvas.
 */
export function tintSprite(sprite, color, amount = 1) {
  const cv = document.createElement('canvas');
  cv.width = sprite.width;
  cv.height = sprite.height;
  const g = cv.getContext('2d');
  g.drawImage(sprite, 0, 0);
  g.globalCompositeOperation = 'source-atop'; // respects the sprite's own alpha
  g.globalAlpha = amount;
  g.fillStyle = color;
  g.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

/* ── A tiny memo cache ───────────────────────────────────────────────────────
   Sprites get rebuilt when the light changes, but the light changes smoothly
   and continuously — so we quantise the key (e.g. to 1/16th of the day) and
   rebuild only when it actually crosses a bucket.
   -------------------------------------------------------------------------- */
export function memo(build, limit = 64) {
  const map = new Map();
  return (key, ...args) => {
    let v = map.get(key);
    if (v === undefined) {
      v = build(...args);
      map.set(key, v);
      if (map.size > limit) map.delete(map.keys().next().value); // FIFO evict
    }
    return v;
  };
}

/* ── A 3×5 font, drawn from ASCII art like everything else here ──────────────
   The scene is a ~500px buffer blown up with `image-rendering: pixelated`.
   `fillText` at that size does not survive it: the browser antialiases the
   glyph, and the upscale then turns every soft edge into a grey smear. In a
   world where a star is one hard pixel, that reads as a bug.

   So the letters are pixels, like the slime and the cottage and the moon. Three
   across, five down, which is the smallest grid an alphabet can be legible in —
   and no wider than the constellations they have to sit under.
   -------------------------------------------------------------------------- */
const GLYPHS = {
  A: '.#.,#.#,###,#.#,#.#', B: '##.,#.#,##.,#.#,##.', C: '.##,#..,#..,#..,.##',
  D: '##.,#.#,#.#,#.#,##.', E: '###,#..,##.,#..,###', F: '###,#..,##.,#..,#..',
  G: '.##,#..,#.#,#.#,.##', H: '#.#,#.#,###,#.#,#.#', I: '###,.#.,.#.,.#.,###',
  J: '..#,..#,..#,#.#,.#.', K: '#.#,#.#,##.,#.#,#.#', L: '#..,#..,#..,#..,###',
  M: '#.#,###,###,#.#,#.#', N: '#.#,###,###,###,#.#', O: '.#.,#.#,#.#,#.#,.#.',
  P: '##.,#.#,##.,#..,#..', Q: '.#.,#.#,#.#,##.,.##', R: '##.,#.#,##.,#.#,#.#',
  S: '.##,#..,.#.,..#,##.', T: '###,.#.,.#.,.#.,.#.', U: '#.#,#.#,#.#,#.#,###',
  V: '#.#,#.#,#.#,#.#,.#.', W: '#.#,#.#,###,###,#.#', X: '#.#,#.#,.#.,#.#,#.#',
  Y: '#.#,#.#,.#.,.#.,.#.', Z: '###,..#,.#.,#..,###',
  0: '###,#.#,#.#,#.#,###', 1: '.#.,##.,.#.,.#.,###', 2: '##.,..#,.#.,#..,###',
  3: '##.,..#,.#.,..#,##.', 4: '#.#,#.#,###,..#,..#', 5: '###,#..,##.,..#,##.',
  6: '.##,#..,###,#.#,###', 7: '###,..#,.#.,.#.,.#.', 8: '###,#.#,###,#.#,###',
  9: '###,#.#,###,..#,##.',
  '-': '...,...,###,...,...', '.': '...,...,...,...,.#.', "'": '.#.,.#.,...,...,...',
  '!': '.#.,.#.,.#.,...,.#.', '?': '##.,..#,.#.,...,.#.',
  ':': '...,.#.,...,.#.,...', '°': '.#.,#.#,.#.,...,...', '/': '..#,..#,.#.,#..,#..',
};

const ADVANCE = 4; // 3px glyph + 1px gap

/** Width, in scene pixels, that `pxText` will occupy. */
export const textWidth = (text) => Math.max(0, text.length * ADVANCE - 1);

/** Draw uppercase pixel text with its top-left at (x, y). Unknown chars are spaces. */
export function pxText(g, x, y, text, color) {
  g.fillStyle = color;

  let cx = Math.round(x);
  for (const ch of String(text).toUpperCase()) {
    const glyph = GLYPHS[ch];
    if (glyph) {
      const rows = glyph.split(',');
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 3; c++) {
          if (rows[r][c] === '#') g.fillRect(cx + c, Math.round(y) + r, 1, 1);
        }
      }
    }
    cx += ADVANCE;
  }
}

/** Canvas-ready colour from an rgb tuple. Re-exported so layers import one file. */
export const css = rgbCss;
