/* ============================================================================
   season.js — the year, as a continuously interpolated set of world properties.

   The day/night cycle in palette.js gives the world an hour. This gives it a
   DATE. Together they're the difference between "a nice pixel scene" and "a
   place that exists" — a place has a January and a June, and they don't look
   alike.

   Four keyframes at the solstices and equinoxes, blended continuously by
   day-of-year. There is no moment at which the world "becomes autumn"; the
   leaves simply get browner, week over week, and one day you notice.

   HEMISPHERE. Seasons are flipped below the equator. We know the latitude
   (the weather service reports it), so Sydney gets its summer in December, as
   it should. Getting this wrong is the kind of thing that tells half the planet
   the software wasn't written with them in mind.
   ========================================================================== */

import { clamp, lerp, smoothstep, mixRgb, hexToRgb } from '../core/util.js';

/**
 * Keyframes, positioned by day-of-year (northern hemisphere).
 *   79  ≈ 20 Mar — vernal equinox
 *   172 ≈ 21 Jun — summer solstice
 *   266 ≈ 23 Sep — autumnal equinox
 *   355 ≈ 21 Dec — winter solstice
 *
 * Every field here is read by a layer. Nothing is decorative.
 */
const KEYS = [
  {
    at: 79,
    key: 'spring',
    name: 'Spring',
    caption: 'spring. everything is trying its best.',
    grassFar: '#5aa25c', grassNear: '#2f6b40',
    bladeLight: '#7fd06a', bladeDark: '#2f6b40',
    treeDark: '#1e3a30', treeMid: '#2f5c42', treeLit: '#4c7d55',
    snow: 0,        // ground cover, 0–1
    petals: 1,      // cherry blossom drift
    leafFall: 0.15, // dead-leaf multiplier
    butterflies: 1.4,
    fireflies: 0.7,
    pollen: 1.3,
    flowers: 1,     // how open/abundant the meadow flowers are
    fogBias: 0.12,
  },
  {
    at: 172,
    key: 'summer',
    name: 'Summer',
    caption: 'high summer. the grass is showing off.',
    grassFar: '#4e8a52', grassNear: '#2c5a38',
    bladeLight: '#6fc06a', bladeDark: '#2f6b40',
    treeDark: '#1e3a30', treeMid: '#2c5040', treeLit: '#3f6b4f',
    snow: 0,
    petals: 0,
    leafFall: 0.25,
    butterflies: 1,
    fireflies: 1.35, // summer nights are what fireflies are FOR
    pollen: 1,
    flowers: 1,
    fogBias: 0,
  },
  {
    at: 266,
    key: 'autumn',
    name: 'Autumn',
    caption: 'autumn. the trees are letting go, gracefully.',
    grassFar: '#8a8a4a', grassNear: '#5c5230',
    bladeLight: '#c2a55a', bladeDark: '#6b5a30',
    treeDark: '#5a3520', treeMid: '#a05f2a', treeLit: '#d98a4a',
    snow: 0,
    petals: 0,
    leafFall: 2.6, // the whole point of autumn
    butterflies: 0.3,
    fireflies: 0.35,
    pollen: 0.2,
    flowers: 0.5,
    fogBias: 0.3, // morning mist
  },
  {
    at: 355,
    key: 'winter',
    name: 'Winter',
    caption: 'winter. the world is holding its breath.',
    grassFar: '#7f8a92', grassNear: '#4a5560',
    bladeLight: '#9aa6b0', bladeDark: '#525d68',
    treeDark: '#2a3038', treeMid: '#3a444e', treeLit: '#5d6a76',
    snow: 1,
    petals: 0,
    leafFall: 0.1,
    butterflies: 0,
    fireflies: 0,
    pollen: 0,
    flowers: 0.06, // a couple of stubborn ones
    fogBias: 0.35,
  },
];

const rgbCache = new Map();
const rgb = (hex) => {
  let v = rgbCache.get(hex);
  if (!v) rgbCache.set(hex, (v = hexToRgb(hex)));
  return v;
};

const YEAR = 365.25;

/** Day of the year, 1–365, fractional. */
export function dayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  return (date - start) / 86400000;
}

/**
 * Solar declination — the sun's tilt on a given day, ±23.44°.
 * This is what actually MAKES the seasons, and we use it for two things: the
 * height of the sun's arc, and the length of the day.
 */
export function declination(doy) {
  return -23.44 * Math.cos(((2 * Math.PI) / YEAR) * (doy + 10));
}

/**
 * The sun's maximum altitude today, at this latitude, in degrees.
 * A summer sun climbs near-overhead and casts a tall arc; a winter sun at 55°N
 * barely clears 11° and skims the horizon all day. Feeding this into the
 * celestial layer is why winter *looks* like winter before you've read a word.
 */
export function maxSolarAltitude(lat, doy) {
  return 90 - Math.abs(lat - declination(doy));
}

/** Find the two keyframes bracketing this day, wrapping across new year. */
function bracket(doy) {
  for (let i = 0; i < KEYS.length; i++) {
    const a = KEYS[i];
    const b = KEYS[(i + 1) % KEYS.length];
    const bAt = b.at <= a.at ? b.at + YEAR : b.at;
    let d = doy;
    if (d < a.at) d += YEAR;
    if (d >= a.at && d < bAt) return [a, b, (d - a.at) / (bAt - a.at)];
  }
  return [KEYS[0], KEYS[1], 0];
}

/**
 * The season, for a date and a latitude.
 *
 * @param {Date}   date
 * @param {number} lat       latitude; negative flips the hemisphere
 * @param {string} override  force a season, or null for the real calendar
 */
export function getSeason(date = new Date(), lat = 45, override = null) {
  let doy = dayOfYear(date);

  // Southern hemisphere: half a year out of phase. December is high summer.
  if (lat < 0) doy = (doy + YEAR / 2) % YEAR;

  // A forced season parks us on that keyframe exactly.
  if (override) {
    const i = KEYS.findIndex((k) => k.key === override);
    if (i >= 0) doy = KEYS[i].at;
  }

  const [a, b, raw] = bracket(doy);
  const t = smoothstep(raw);

  const n = (k) => lerp(a[k], b[k], t);
  const c = (k) => mixRgb(rgb(a[k]), rgb(b[k]), t);

  return {
    key: t < 0.5 ? a.key : b.key,
    name: t < 0.5 ? a.name : b.name,
    caption: t < 0.5 ? a.caption : b.caption,
    doy,
    blend: t,
    // 0–1 through the whole year — handy for anything that wants a smooth ramp.
    year: doy / YEAR,

    grassFar: c('grassFar'),
    grassNear: c('grassNear'),
    bladeLight: c('bladeLight'),
    bladeDark: c('bladeDark'),
    treeDark: c('treeDark'),
    treeMid: c('treeMid'),
    treeLit: c('treeLit'),

    snow: clamp(n('snow'), 0, 1),
    petals: clamp(n('petals'), 0, 1),
    leafFall: n('leafFall'),
    butterflies: n('butterflies'),
    fireflies: n('fireflies'),
    pollen: n('pollen'),
    flowers: clamp(n('flowers'), 0, 1),
    fogBias: clamp(n('fogBias'), 0, 1),

    declination: declination(doy),
  };
}

export const SEASON_KEYS = KEYS.map((k) => k.key);
export const SEASON_ICON = { spring: '🌸', summer: '🌻', autumn: '🍂', winter: '❄️' };
