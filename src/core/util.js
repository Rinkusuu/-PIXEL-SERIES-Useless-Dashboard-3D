/* ============================================================================
   util.js — the small sharp tools. Pure functions only; no state, no DOM refs
   held. Everything here is used by both the scene and the widgets.
   ========================================================================== */

// ── Math ────────────────────────────────────────────────────────────────────

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => t * t * (3 - 2 * t);

/** Remap `v` from one range to another, clamped. */
export const remap = (v, a, b, c, d) => lerp(c, d, clamp(invLerp(a, b, v), 0, 1));

/**
 * Frame-rate independent exponential smoothing.
 * `rate` is roughly "fraction of the gap closed per second".
 * Without the dt term, a 144Hz monitor eases 2.4x faster than a 60Hz one.
 */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/** Snap to the pixel grid. The scene buffer has no sub-pixels to give. */
export const snap = (v) => Math.round(v);

export const TAU = Math.PI * 2;

// ── Deterministic randomness ────────────────────────────────────────────────

/**
 * mulberry32 — tiny, fast, well-distributed seeded PRNG.
 * Used everywhere the world must look random but regenerate identically
 * (mountain ridges, star fields, the daily fortune).
 */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a 32-bit int — lets us seed from a date, a name, anything. */
export function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Today's seed: stable for the whole calendar day, different tomorrow. */
export const daySeed = (salt = '') => {
  const d = new Date();
  return hash(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}:${salt}`);
};

export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length) % arr.length];

/** 1-D value noise — smooth, cheap, seamless enough for clouds and hills. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    let t = (n + seed * 374761393) >>> 0;
    t = Math.imul(t ^ (t >>> 13), 1274126177);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
  return lerp(h(i), h(i + 1), smoothstep(f));
}

/** Layered value noise. `oct` octaves, each half the amplitude and twice the rate. */
export function fbm1(x, oct = 4, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += noise1(x * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * 2-D value noise.
 *
 * This exists because the obvious shortcut — `fbm1(x * a + y * b)` — is not 2-D
 * noise and never was. It's 1-D noise sampled along a diagonal, so every point
 * on the line `a·x + b·y = c` gets the SAME value. Feed it to a snow mask and
 * the snow falls in diagonal stripes; the ground looks combed. It shipped that
 * way in the meadow, and it looked exactly as wrong as it sounds.
 *
 * Four corner hashes, bilinearly interpolated with a smoothstep on each axis.
 */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const h = (a, b) => {
    let t = (a * 374761393 + b * 668265263 + seed * 1274126177) >>> 0;
    t = Math.imul(t ^ (t >>> 13), 1274126177);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };

  const u = smoothstep(fx);
  const v = smoothstep(fy);

  return lerp(
    lerp(h(ix, iy), h(ix + 1, iy), u),
    lerp(h(ix, iy + 1), h(ix + 1, iy + 1), u),
    v
  );
}

/** Layered 2-D value noise. Same octave structure as fbm1, one more dimension. */
export function fbm2(x, y, oct = 3, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += noise2(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// ── Colour ──────────────────────────────────────────────────────────────────

/** '#rrggbb' → [r,g,b]. Accepts the 3-digit form too. */
export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = ([r, g, b]) =>
  '#' +
  ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b))
    .toString(16)
    .slice(1);

export const mixRgb = (a, b, t) => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

export const rgbCss = ([r, g, b], a = 1) =>
  a >= 1
    ? `rgb(${r | 0},${g | 0},${b | 0})`
    : `rgba(${r | 0},${g | 0},${b | 0},${a})`;

/** Perceived luminance, 0–1. Used to decide if text should go dark. */
export const luma = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Push a colour toward or away from black. `amt` > 1 brightens. */
export const shade = ([r, g, b], amt) => [
  clamp(r * amt, 0, 255),
  clamp(g * amt, 0, 255),
  clamp(b * amt, 0, 255),
];

// ── DOM ─────────────────────────────────────────────────────────────────────

/**
 * Terse element factory.
 *   el('div.panel', { id: 'x' }, [el('h2', {}, 'Hi')])
 * Tag syntax supports `tag.class.class` and a bare `.class` (implies div).
 */
export function el(spec, attrs = {}, children = []) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');

  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }

  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);

/** Two-digit pad — clocks, dates, timers all want it. */
export const pad2 = (n) => String(n).padStart(2, '0');

/** Fire `fn` on the next frame, but never more than once per frame. */
export function raf1(fn) {
  let queued = false;
  return (...args) => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...args);
    });
  };
}
