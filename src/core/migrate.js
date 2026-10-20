/* ============================================================================
   migrate.js — turn whatever an older version left in localStorage into a
   state the current version can trust. Pure, so it can be tested in node.

   The rule is CARRY, THEN CLEAN: every key comes across (including ones this
   file has never heard of — `coffeeDay` and `seasonsSeen` were never in the
   defaults), and only the values we know the shape of are normalised. A bad
   entry is dropped on its own; it never takes its neighbours with it.
   ========================================================================== */

import { STAR_COUNT } from '../sky/stars.js';

export const STORE_VERSION = 2;

const MODES = ['auto', 'classic', '3d'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const num = (v, fallback, lo = -Infinity, hi = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

const strings = (v) => (Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === 'string'))] : []);

const isStar = (i) => Number.isInteger(i) && i >= 0 && i < STAR_COUNT;

/** A constellation needs two real stars; fewer is not a line. */
function constellations(v) {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .map((c) => ({
      ...c,
      name: typeof c.name === 'string' ? c.name : '',
      pts: Array.isArray(c.pts) ? c.pts.filter(isStar) : [],
      at: num(c.at, 0),
    }))
    .filter((c) => c.pts.length >= 2);
}

/**
 * @param {unknown} raw       parsed JSON from uad.v1 or uad.v2 (or garbage)
 * @param {object}  defaults  the store's DEFAULTS; never mutated
 */
export function migrate(raw, defaults) {
  const d = structuredClone(defaults);
  const s = { ...d, ...(isObj(raw) ? structuredClone(raw) : {}) };

  s.v = STORE_VERSION;

  s.sound = bool(s.sound, d.sound);
  s.glass = bool(s.glass, d.glass);
  s.reactive = bool(s.reactive, d.reactive);
  s.volume = num(s.volume, d.volume, 0, 1);
  s.mood = num(s.mood, d.mood, 0, 100);

  for (const k of ['coins', 'coffee', 'petFed', 'skips', 'leaves', 'wishes', 'visits']) {
    s[k] = num(s[k], d[k], 0);
  }

  for (const k of ['achievements', 'inventory', 'seasonsSeen']) {
    if (k in s) s[k] = strings(s[k]);
  }

  // Fish are a log, not a set: two carp are two carp.
  s.catches = Array.isArray(s.catches) ? s.catches.filter((c) => typeof c === 'string') : [];

  s.stars = constellations(s.stars);

  const mix = isObj(s.mix) ? s.mix : {};
  s.mix = Object.fromEntries(Object.keys(d.mix).map((k) => [k, num(mix[k], d.mix[k], 0, 1)]));

  // 3D state. New in v2.
  s.mode = MODES.includes(s.mode) ? s.mode : d.mode;
  s.player = isObj(s.player) ? s.player : null;
  s.view = { ...d.view, ...(isObj(s.view) ? s.view : {}) };

  return s;
}
