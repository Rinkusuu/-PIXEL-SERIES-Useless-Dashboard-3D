/* ============================================================================
   palette.js — the day/night cycle, and the single source of colour truth for
   the whole application (the scene AND the UI chrome).

   Nine hand-picked keyframes around the clock. Ask for any fractional hour and
   you get a palette interpolated between the two that bracket it; ask with a
   weather code and the result is desaturated, darkened and cooled to match.

   Why keyframes rather than a physical sky model: a physically-correct sky is
   grey-blue and boring for 14 hours a day. These are *painted* skies — the ones
   Stardew and Sea of Stars use — where dawn is pink because dawn should be pink.
   ========================================================================== */

import { clamp, lerp, mixRgb, hexToRgb, rgbToHex, rgbCss, smoothstep } from '../core/util.js';

/**
 * A keyframe.
 *   at    — hour, 0–24 (wraps)
 *   sky   — [zenith, middle, horizon]
 *   sun   — the celestial body's disc colour
 *   glow  — the key light. Everything emissive borrows this.
 *   accent— the complementary spark (UI focus rings, meters)
 *   land  — colour the terrain is tinted TOWARD, and by how much (landMix)
 *   lum   — 0–1 overall brightness. Drives contrast + how dark the land reads.
 *   stars — 0–1 star visibility
 *   fog   — fog band colour
 */
const KEYS = [
  {
    at: 0, key: 'midnight', caption: 'the world is asleep. so should you be.',
    sky: ['#070a1c', '#0d1330', '#1a2049'],
    sun: '#dfe6ff', glow: '#9db4ff', accent: '#7fd6c2',
    land: '#0e1430', landMix: 0.6, lum: 0.1, stars: 1, fog: '#1a2049',
    ink: '#e6e4ff', inkSoft: '#9a9ac4',
  },
  {
    at: 4.4, key: 'first light', caption: 'first light. the birds are warming up.',
    sky: ['#101736', '#2a2a5e', '#4d3a70'],
    sun: '#ffd9e8', glow: '#a98bff', accent: '#7fd6c2',
    land: '#1a1f42', landMix: 0.5, lum: 0.2, stars: 0.55, fog: '#3b3468',
    ink: '#eee7ff', inkSoft: '#a9a3cf',
  },
  {
    at: 6.1, key: 'dawn', caption: 'dawn. everything is briefly pink.',
    sky: ['#2e3a77', '#7a5d9e', '#f0a08a'],
    sun: '#ffd8a8', glow: '#ff9e7a', accent: '#7fd6c2',
    land: '#4a3a63', landMix: 0.42, lum: 0.42, stars: 0.12, fog: '#c88fa0',
    ink: '#fff4ee', inkSoft: '#c9b6c6',
  },
  {
    at: 7.6, key: 'morning', caption: 'a good morning for doing nothing at all.',
    sky: ['#4a86c8', '#8fc0e0', '#ffd9b0'],
    sun: '#fff3c4', glow: '#ffd479', accent: '#4fb6a0',
    land: '#8fb98f', landMix: 0.16, lum: 0.78, stars: 0, fog: '#dfe7ee',
    ink: '#f2f8ff', inkSoft: '#b6c9de',
  },
  {
    at: 12, key: 'noon', caption: 'high noon. the grass is showing off.',
    sky: ['#2f7ec8', '#63aede', '#b8e2f2'],
    sun: '#ffffff', glow: '#ffe9a8', accent: '#2fa78e',
    land: '#a8d9a0', landMix: 0.1, lum: 1, stars: 0, fog: '#dff0f7',
    ink: '#f4faff', inkSoft: '#bdd0e2',
  },
  {
    at: 16.2, key: 'afternoon', caption: 'long shadows. nothing is urgent.',
    sky: ['#3b7fc0', '#8ab6d8', '#ffd9a8'],
    sun: '#fff0c0', glow: '#ffcf7a', accent: '#3fa892',
    land: '#a3c690', landMix: 0.18, lum: 0.82, stars: 0, fog: '#e2dfd0',
    ink: '#fdf7ef', inkSoft: '#cfc6b8',
  },
  {
    /* The KEYFRAME stays at 18.6 — these are the colours of a late, low sun, and
       interpolating them by the clock is what this file is for.

       The CAPTION cannot stay, because it was making a claim about the sky that
       the clock is in no position to make. "Golden hour" is not 18:36; it is the
       sun sitting between −4° and +6°, which happens at a different time in
       every month and at every latitude, and at this hour in Reykjavík in June
       the sun is still high overhead. main.js now says the golden line when the
       real sun is really there — so this one describes the hour, and lets the
       sky speak for itself. */
    at: 18.6, key: 'golden hour', caption: 'the light is going long. the day is packing up.',
    sky: ['#3d4f96', '#c0729a', '#ffb06a'],
    sun: '#ffd07a', glow: '#ff9d4d', accent: '#5fc7b0',
    land: '#7a6a72', landMix: 0.4, lum: 0.55, stars: 0, fog: '#e0a084',
    ink: '#fff2e4', inkSoft: '#caa9a0',
  },
  {
    at: 20.1, key: 'sunset', caption: 'the sun clocks out. take the hint.',
    sky: ['#1e2358', '#6a3b7e', '#e6636b'],
    sun: '#ff9a5c', glow: '#ff6b6b', accent: '#7fd6c2',
    land: '#3d3155', landMix: 0.5, lum: 0.32, stars: 0.2, fog: '#a05070',
    ink: '#ffeef0', inkSoft: '#c3a2b4',
  },
  {
    at: 21.6, key: 'dusk', caption: 'dusk. the fireflies clock in.',
    sky: ['#0d1230', '#242a5c', '#4a3a72'],
    sun: '#e8e0ff', glow: '#b39dff', accent: '#7fd6c2',
    land: '#1c2247', landMix: 0.58, lum: 0.17, stars: 0.8, fog: '#2f2f60',
    ink: '#eae7ff', inkSoft: '#9e9ac8',
  },
];

/** Cheap object → rgb tuple, memoised. hexToRgb runs a parseInt every call. */
const cache = new Map();
const rgb = (hex) => {
  let v = cache.get(hex);
  if (!v) cache.set(hex, (v = hexToRgb(hex)));
  return v;
};

/** Find the two keyframes bracketing `hour` and how far between them we are. */
function bracket(hour) {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < KEYS.length; i++) {
    const a = KEYS[i];
    const b = KEYS[(i + 1) % KEYS.length];
    // The last span wraps midnight: 21.6 → 24 → 0.
    const bAt = b.at <= a.at ? b.at + 24 : b.at;
    if (h >= a.at && h < bAt) return [a, b, (h - a.at) / (bAt - a.at)];
    // The wrapped span again, for hours before the first key (00:00–04:24).
    if (bAt > 24 && h + 24 >= a.at && h + 24 < bAt) {
      return [a, b, (h + 24 - a.at) / (bAt - a.at)];
    }
  }
  return [KEYS[0], KEYS[1], 0];
}

/**
 * Weather modifiers. Each is applied AFTER the time interpolation, so a storm
 * at noon and a storm at midnight are both storms but still read as noon and
 * midnight. Weather grades the image; it doesn't replace it.
 *
 *   desat — pull every colour toward its own grey
 *   dark  — multiply luminance
 *   cool  — mix the sky toward this colour
 */
/* Tuned against the dusk-storm case, which is the darkest thing this app can
   render. The physically-honest values (storm ≈ 0.48 luminance) produced a
   near-black frame: correct, and dead. A storm in a cosy game stays a moody
   BLUE — you must still be able to read the mountains and see the rain fall.
   So the darkening is pulled back and the cool tints are lifted; the drama
   comes from the lightning and the rain, not from turning the lights off. */
const WEATHER_GRADE = {
  clear:  { desat: 0,    dark: 1,    cool: null,      fogBoost: 0 },
  cloudy: { desat: 0.3,  dark: 0.86, cool: '#8895ad', fogBoost: 0.15 },
  fog:    { desat: 0.45, dark: 0.82, cool: '#9aa4b4', fogBoost: 0.75 },
  rain:   { desat: 0.44, dark: 0.74, cool: '#6d7d9c', fogBoost: 0.35 },
  storm:  { desat: 0.5,  dark: 0.62, cool: '#4c5878', fogBoost: 0.45 },
  snow:   { desat: 0.35, dark: 0.9,  cool: '#c3cfe0', fogBoost: 0.5 },
};

const greyscale = (c) => {
  const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return [y, y, y];
};

function grade(c, g) {
  let out = c;
  if (g.desat) out = mixRgb(out, greyscale(out), g.desat);
  if (g.cool) out = mixRgb(out, rgb(g.cool), g.desat * 0.55);
  if (g.dark !== 1) out = out.map((v) => v * g.dark);
  return out;
}

/**
 * Build the palette for a given hour + weather.
 * Returns rgb tuples (for canvas) plus css strings (for the DOM).
 */
export function getPalette(hour, weather = 'clear', season = null, breath = 0.5) {
  const [a, b, raw] = bracket(hour);
  const t = smoothstep(raw); // ease the transition; linear reads as a wipe
  const g = WEATHER_GRADE[weather] || WEATHER_GRADE.clear;

  const mixHex = (ka, kb) => mixRgb(rgb(ka), rgb(kb), t);

  const sky = [
    grade(mixHex(a.sky[0], b.sky[0]), g),
    grade(mixHex(a.sky[1], b.sky[1]), g),
    grade(mixHex(a.sky[2], b.sky[2]), g),
  ];

  /* Breath. In Zen mode the world's ambient light rises and falls with your
     lungs — a ±8% swing, which sounds like nothing and is in fact plenty: it's
     right at the edge of conscious perception, so you don't *see* the world
     brightening, you feel that it did. Anything stronger reads as a flicker. */
  const breathLift = 1 + (breath - 0.5) * 0.16;

  const lum = clamp(lerp(a.lum, b.lum, t) * g.dark * breathLift, 0, 1);

  /* Bad weather doesn't just dim the sky — it changes the light landing on the
     ground. Without this boost, a noon thunderstorm renders a grey sky over a
     BRIGHT SUMMER MEADOW, because landMix at noon is only 0.10 and the grass
     keeps its own colour. That split reads instantly as two images pasted
     together. Pulling the terrain further toward the (already-graded) land tone
     is what re-unifies the frame. */
  const landMix = clamp(lerp(a.landMix, b.landMix, t) + g.desat * 0.45, 0, 0.9);

  /* Season pushes the whole frame's cast. Winter light is genuinely BLUER —
     the sun is low, so the light travels through more atmosphere and the shadows
     fill with skylight — and autumn light is genuinely warmer. Nudging the key
     light and the fog by season is what stops "autumn" from being nothing but
     orange trees pasted onto a summer afternoon. */
  const SEASON_CAST = {
    spring: { glow: '#ffe4c0', mix: 0.1 },
    summer: { glow: '#fff0b0', mix: 0.08 },
    autumn: { glow: '#ffb870', mix: 0.2 },
    winter: { glow: '#cfe2ff', mix: 0.24 },
  };
  const cast = season ? SEASON_CAST[season.key] : null;

  let glow = grade(mixHex(a.glow, b.glow), {
    ...g,
    desat: g.desat * 0.5,
    dark: lerp(1, g.dark, 0.5),
  });
  let fog = grade(mixHex(a.fog, b.fog), g);
  if (cast) {
    glow = mixRgb(glow, rgb(cast.glow), cast.mix);
    fog = mixRgb(fog, rgb(cast.glow), cast.mix * 0.6);
  }

  const pal = {
    key: t < 0.5 ? a.key : b.key,
    caption: t < 0.5 ? a.caption : b.caption,
    hour,
    weather,
    season: season?.key ?? 'summer',

    sky,
    sun: grade(mixHex(a.sun, b.sun), { ...g, dark: lerp(1, g.dark, 0.4) }),
    // The key light keeps most of its punch in bad weather — an overcast day
    // still has a sun behind it, and a fully-graded glow makes the scene dead.
    glow,
    accent: mixHex(a.accent, b.accent),
    land: grade(mixHex(a.land, b.land), g),
    fog,
    ink: mixHex(a.ink, b.ink),
    inkSoft: mixHex(a.inkSoft, b.inkSoft),

    landMix,
    lum,
    stars: clamp(lerp(a.stars, b.stars, t) * (1 - g.desat * 0.9), 0, 1),
    fogAmount: clamp(g.fogBoost + (1 - lum) * 0.1 + (season?.fogBias ?? 0) * 0.5, 0, 1),
    night: lum < 0.35,
  };

  /**
   * Tint any terrain colour by the current light.
   * This is the one function that makes the world feel *lit* rather than
   * merely coloured: the same grass hex becomes olive at noon, rose at dawn and
   * near-black indigo at midnight, because it's being mixed toward `land` and
   * scaled by `lum` — exactly like a real light on a real surface.
   */
  pal.lit = (hex, extraLum = 1) => {
    const base = typeof hex === 'string' ? rgb(hex) : hex;
    const mixed = mixRgb(base, pal.land, pal.landMix);
    const k = (0.35 + pal.lum * 0.75) * extraLum;
    return [
      clamp(mixed[0] * k, 0, 255),
      clamp(mixed[1] * k, 0, 255),
      clamp(mixed[2] * k, 0, 255),
    ];
  };

  /** Same, but straight to a canvas-ready string. */
  pal.litCss = (hex, extraLum = 1, alpha = 1) => rgbCss(pal.lit(hex, extraLum), alpha);

  return pal;
}

/**
 * Push the palette into CSS custom properties so the glass panels, the buttons
 * and the text all inherit the sky's mood. Called ~4×/s, not every frame —
 * writing custom properties invalidates style for the whole subtree, and no
 * human can see a colour move faster than that anyway.
 */
export function applyPaletteToDOM(pal) {
  const r = document.documentElement.style;

  /* The panels are dark frosted glass at EVERY hour — that's the art direction
     (dark UI plates floating over a bright world, the way Hyper Light Drifter
     and Sea of Stars do it). So the job here is to carry the sky's HUE into the
     chrome while forcing its LIGHTNESS down to a level that white text can
     always sit on.

     We derive from sky[1] (the middle band) rather than sky[0] (the zenith),
     because the zenith goes almost achromatic at midnight and we'd lose the
     tint entirely. Mixing 72% toward near-black keeps dawn peach-dark, noon
     navy-dark and midnight ink-dark — visibly different, uniformly legible. */
  const INK_BLACK = [8, 8, 16];
  const base = pal.sky[1];

  const deep = mixRgb(base, INK_BLACK, 0.72);
  // A breath of the key light so the glass warms up at golden hour.
  const deepTinted = mixRgb(deep, pal.glow, 0.06);

  r.setProperty('--amb-deep', rgbToHex(deepTinted));
  r.setProperty('--amb-mid', rgbToHex(mixRgb(base, INK_BLACK, 0.42)));
  r.setProperty('--amb-lift', rgbToHex(mixRgb(mixRgb(base, INK_BLACK, 0.3), pal.glow, 0.22)));
  r.setProperty('--amb-glow', rgbToHex(pal.glow));
  r.setProperty('--amb-accent', rgbToHex(pal.accent));
  r.setProperty('--amb-ink', rgbToHex(pal.ink));
  r.setProperty('--amb-ink-soft', rgbToHex(pal.inkSoft));
  r.setProperty('--amb-lum', pal.lum.toFixed(3));
}

export const PHASE_KEYS = KEYS.map((k) => k.key);
