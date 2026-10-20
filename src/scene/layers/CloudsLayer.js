/* ============================================================================
   CloudsLayer — three parallax bands of drifting pixel cumulus.

   Each cloud is a blob of overlapping pixel rects baked ONCE into its own tiny
   canvas at spawn, then blitted. Redrawing 40 clouds × ~14 rects every frame is
   560 fills; blitting 40 cached sprites is 40 memcpys. Same picture.

   Cloud coverage follows the weather: 3 wisps when clear, a full ceiling in a
   storm. The bands scroll at different speeds, which is 80% of what makes a
   flat sky read as deep.
   ========================================================================== */

import { Layer } from '../Layer.js';
import { rgbCss, rng, clamp, lerp, remap } from '../../core/util.js';

/** How much of the sky each condition fills, 0–1. */
const COVERAGE = {
  clear: 0.16,
  cloudy: 0.8,
  fog: 0.55,
  rain: 0.9,
  storm: 1,
  snow: 0.85,
};

const BANDS = [
  { y: [0.04, 0.16], scale: 3, speed: 2.6, depth: 0.14, alpha: 0.5 },
  { y: [0.13, 0.28], scale: 2, speed: 5.2, depth: 0.22, alpha: 0.75 },
  { y: [0.24, 0.42], scale: 1, speed: 9.0, depth: 0.34, alpha: 1.0 },
];

const MAX_PER_BAND = 16;

export class CloudsLayer extends Layer {
  constructor() {
    super({ depth: 0.25, name: 'clouds' });
    this.clouds = [];
    this._sig = '';
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this._spawn();
  }

  _spawn() {
    const r = rng(4242);
    this.clouds = [];
    BANDS.forEach((band, bi) => {
      for (let i = 0; i < MAX_PER_BAND; i++) {
        this.clouds.push({
          band: bi,
          x: r() * (this.W + 200) - 100,
          y: lerp(this.H * band.y[0], this.H * band.y[1], r()),
          w: 26 + r() * 42,
          h: 8 + r() * 10,
          seed: Math.floor(r() * 1e6),
          // Each cloud has a rank; only clouds under the coverage threshold are
          // drawn. Raising coverage reveals more of the SAME clouds rather than
          // spawning new ones, so the sky thickens instead of flickering.
          rank: i / MAX_PER_BAND,
          puffs: null,
          fade: 0,
          speedJitter: 0.75 + r() * 0.5,
        });
      }
    });
  }

  /** Bake one cloud's puffs into a sprite for the current light. */
  _bake(c, pal) {
    const r = rng(c.seed);
    const cv = document.createElement('canvas');
    const W = Math.ceil(c.w) + 8;
    const H = Math.ceil(c.h) + 10;
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');

    // Clouds are lit from wherever the key light is: bright cap, mid body,
    // shadowed underside. Three tones is all a pixel cloud ever needs.
    const cap = rgbCss(pal.lit('#ffffff', 1.08));
    const body = rgbCss(pal.lit('#dfe4f2', 0.95));
    const under = rgbCss(pal.lit('#a9b2cc', 0.8));

    const n = 5 + Math.floor(r() * 5);
    const puffs = [];
    for (let i = 0; i < n; i++) {
      const px_ = (i / (n - 1)) * c.w;
      // Fatter in the middle: a cloud is a lump, not a sausage.
      const bulge = Math.sin((i / (n - 1)) * Math.PI);
      const pw = 8 + r() * 14 + bulge * 8;
      const ph = 4 + bulge * c.h * (0.6 + r() * 0.5);
      puffs.push({ x: px_, y: c.h - ph + r() * 3, w: pw, h: ph });
    }

    // Body.
    for (const p of puffs) {
      g.fillStyle = body;
      g.fillRect(Math.round(p.x), Math.round(p.y + 4), Math.round(p.w), Math.round(p.h));
    }
    // Lit cap.
    for (const p of puffs) {
      g.fillStyle = cap;
      g.fillRect(Math.round(p.x + 1), Math.round(p.y + 2), Math.round(p.w - 2), 3);
    }
    // Flat shadowed base.
    g.fillStyle = under;
    g.fillRect(0, Math.round(c.h + 3), Math.round(c.w), 3);

    return cv;
  }

  update(env) {
    const { dt, pal, wind, motion } = env;
    const target = COVERAGE[pal.weather] ?? 0.2;

    // Rebake when the light has moved appreciably.
    const sig = `${pal.key}|${Math.round(pal.lum * 8)}|${pal.weather}`;
    const rebake = sig !== this._sig;
    if (rebake) this._sig = sig;

    for (const c of this.clouds) {
      const band = BANDS[c.band];
      // Reduced motion parks the clouds. They still fade in and out with the
      // weather — the sky thickens and clears, it just doesn't travel.
      c.x += band.speed * (0.35 + wind) * c.speedJitter * dt * 6 * motion;

      // Wrap. Re-entering clouds get a new vertical slot so the band doesn't
      // become a visibly repeating conveyor belt.
      if (c.x > this.W + 110) {
        c.x = -110;
        c.y = lerp(this.H * band.y[0], this.H * band.y[1], Math.random());
      }

      const visible = c.rank < target;
      c.fade = clamp(c.fade + (visible ? dt * 0.4 : -dt * 0.4), 0, 1);

      if (rebake) c.puffs = null;
      if (!c.puffs && c.fade > 0.01) c.puffs = this._bake(c, pal);
    }
  }

  draw(g, env) {
    const { quality } = env;

    for (const c of this.clouds) {
      if (c.fade <= 0.01 || !c.puffs) continue;
      const band = BANDS[c.band];

      // Under load, drop the two far bands first — they're the least legible.
      if (quality < 0.6 && c.band < 1) continue;

      const x = c.x + env.parallax.x * band.depth;
      const y = c.y + env.parallax.y * band.depth;

      g.globalAlpha = c.fade * band.alpha;
      g.drawImage(c.puffs, Math.round(x), Math.round(y));
      g.globalAlpha = 1;
    }
  }
}
