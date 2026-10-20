/* ============================================================================
   MountainsLayer — three ridgelines, generated from fbm noise, baked to canvas.

   The ridge silhouettes never change, so they're rasterised once per resize
   into a full-width sprite and blitted with a parallax offset. Only the *tint*
   changes with the light, which we do with a single composite pass over the
   cached sprite instead of re-walking 500 columns of noise every frame.

   Depth cues, in order of how much they matter:
     1. atmospheric fade — far ridges mix toward the sky colour. This alone
        does more for depth than any amount of extra detail.
     2. parallax speed
     3. snow caps only on the tall ridge
   ========================================================================== */

import { Layer } from '../Layer.js';
import { rgbCss, fbm1, clamp, lerp, mixRgb } from '../../core/util.js';

const RIDGES = [
  // haze: how far this ridge is mixed toward the sky. depth: parallax factor.
  { seed: 11, base: '#5a6b96', horizon: 0.50, amp: 0.155, freq: 0.010, haze: 0.62, depth: 0.10, snow: false, rough: 3 },
  { seed: 27, base: '#3f4d78', horizon: 0.53, amp: 0.115, freq: 0.017, haze: 0.36, depth: 0.18, snow: true,  rough: 4 },
  { seed: 43, base: '#2b3557', horizon: 0.56, amp: 0.075, freq: 0.027, haze: 0.14, depth: 0.28, snow: false, rough: 5 },
];

export class MountainsLayer extends Layer {
  constructor() {
    super({ depth: 0.18, name: 'mountains' });
    this.sprites = [];
    this._sig = '';
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this._sig = ''; // force a rebake at the new size
    this._heights = RIDGES.map((rg) => this._profile(rg, W, H));
  }

  /** Precompute the ridge height for every column. Pure function of the seed. */
  _profile(rg, W, H) {
    const out = new Float32Array(W + 240);
    for (let x = 0; x < out.length; x++) {
      let h = fbm1(x * rg.freq, rg.rough, rg.seed);
      // Sharpen the noise into peaks. Raw fbm gives you rolling dunes; a power
      // curve gives you mountains.
      h = Math.pow(h, 1.5);
      out[x] = H * rg.horizon - h * H * rg.amp;
    }
    return out;
  }

  /** Bake ONE ridge for the current light. Each gets its own sprite so each can
      travel at its own parallax speed — a shared sprite would flatten all three
      into a single plane, which is exactly the depth we're paying for. */
  _bake(rg, prof, pal) {
    const W = this.W + 240; // extra width so parallax can't reveal an edge
    const H = this.H;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');

    // Atmospheric perspective: mix the rock toward the horizon sky colour.
    const rock = mixRgb(pal.lit(rg.base), pal.sky[2], rg.haze * 0.75);
    const rockCss = rgbCss(rock);
    // Rim light on the sun-facing side of each peak.
    const rimCss = rgbCss(mixRgb(rock, pal.glow, 0.35 * (1 - rg.haze)));
    const snowCss = rgbCss(mixRgb(pal.lit('#eef2ff', 1.1), pal.sky[2], rg.haze * 0.6));

    for (let x = 0; x < W; x++) {
      const y = Math.round(prof[x]);
      g.fillStyle = rockCss;
      g.fillRect(x, y, 1, H - y);

      // Rim: where the slope descends to the right, the light catches it.
      const slope = prof[Math.min(W - 1, x + 1)] - prof[x];
      if (slope > 0.35) {
        g.fillStyle = rimCss;
        g.fillRect(x, y, 1, 2);
      }

      // Snow above a threshold altitude, with a ragged fbm snowline so it
      // doesn't cut a horizontal line across the peaks.
      if (rg.snow) {
        const line = H * rg.horizon - H * rg.amp * (0.52 + fbm1(x * 0.06, 2, 99) * 0.22);
        if (y < line) {
          const depth = clamp((line - y) / 12, 0, 1);
          g.fillStyle = snowCss;
          g.fillRect(x, y, 1, Math.round(1 + depth * 5));
        }
      }
    }

    return cv;
  }

  draw(g, env) {
    const { pal, parallax } = env;

    const sig = `${pal.key}|${Math.round(pal.lum * 10)}|${pal.weather}|${this.W}x${this.H}`;
    if (sig !== this._sig) {
      this._sig = sig;
      this.sprites = RIDGES.map((rg, i) => this._bake(rg, this._heights[i], pal));
    }

    // Back to front, each on its own plane.
    RIDGES.forEach((rg, i) => {
      const x = -120 + parallax.x * rg.depth;
      const y = parallax.y * rg.depth * 0.4;
      g.drawImage(this.sprites[i], Math.round(x), Math.round(y));
    });
  }
}
