/* ============================================================================
   FogLayer — horizontal bands of drifting mist, plus the final colour grade.

   Two jobs:

   1. FOG. Soft horizontal bands whose vertical position is driven by fbm and
      which scroll at different speeds. They sit low, hugging the water and the
      base of the treeline, because that is where fog actually forms and because
      it's the read that separates the far plane from the near plane.

   2. GRADE. The last thing that touches the frame. A warm/cool wash pulled from
      the current key light, plus a gentle darkening of the top corners. This is
      the "colour grade" pass every film gets and almost no web canvas does —
      it's what stops the scene looking like a set of correctly-coloured objects
      and starts it looking like a single photograph.
   ========================================================================== */

import { Layer } from '../Layer.js';
import { rgbCss, clamp, lerp, fbm1, mixRgb } from '../../core/util.js';

const BANDS = [
  { y: 0.545, h: 26, speed: 3.2, alpha: 0.55, freq: 0.011 },
  { y: 0.60, h: 34, speed: -2.1, alpha: 0.42, freq: 0.016 },
  { y: 0.67, h: 40, speed: 4.6, alpha: 0.3, freq: 0.021 },
  { y: 0.78, h: 46, speed: -1.4, alpha: 0.22, freq: 0.009 },
];

export class FogLayer extends Layer {
  constructor() {
    super({ depth: 0.5, name: 'fog' });
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
  }

  draw(g, env) {
    const { pal, quality, offline = 0 } = env;

    /* Offline thickens the mist. The world doesn't tell you the network died —
       it just gets harder to see very far, which is what being cut off actually
       feels like. `pal.fogAmount` is whatever the weather and season already
       wanted; this only ever adds. */
    const amount = clamp(pal.fogAmount + offline * 0.45, 0, 1);
    if (amount > 0.02) this._fog(g, env, amount, quality);

    this._grade(g, pal, offline);
  }

  _fog(g, env, amount, quality) {
    const { pal, t } = env;
    const col = rgbCss(pal.fog);

    // The far bands read least; drop them first under load.
    const bands = quality < 0.7 ? BANDS.slice(0, 2) : BANDS;

    for (const b of bands) {
      const baseY = this.H * b.y;
      const drift = t * b.speed;

      // 3px columns: fine enough to look continuous, coarse enough to be cheap.
      for (let x = 0; x < this.W; x += 3) {
        const n = fbm1(x * b.freq + drift * 0.1, 3, b.h);
        const n2 = fbm1(x * b.freq * 2.5 - drift * 0.06, 2, b.h + 50);

        const top = baseY + (n - 0.5) * b.h * 0.9;
        const h = b.h * (0.35 + n2 * 0.8);

        const a = amount * b.alpha * n2 * 0.9;
        if (a < 0.015) continue;

        g.globalAlpha = clamp(a, 0, 0.8);
        g.fillStyle = col;
        g.fillRect(x, Math.round(top), 3, Math.round(h));
      }
    }
    g.globalAlpha = 1;
  }

  /**
   * The grade. Two passes:
   *   · a multiply-ish wash toward the land tone in the corners (vignette that
   *     tints rather than just darkens — a black vignette looks like a lens,
   *     a tinted one looks like atmosphere);
   *   · a screen pass of the key light across the whole frame at low alpha,
   *     which unifies the palette and is why the scene reads as one image.
   */
  _grade(g, pal, offline = 0) {
    // Warm/cool unifying wash.
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.14 + (1 - pal.lum) * 0.1;
    g.fillStyle = rgbCss(pal.glow);
    g.fillRect(0, 0, this.W, this.H);

    // Deepen the shadows a touch — overlay alone flattens the image.
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.1 + (1 - pal.lum) * 0.14;
    g.fillStyle = rgbCss(mixRgb(pal.sky[0], pal.land, 0.5));
    g.fillRect(0, 0, this.W, this.H);

    /* The colour drains, a little, when we're cut off.

       `saturation` blend takes the frame's own luminance and pushes it toward
       the saturation of what we paint — a flat grey — so the world doesn't go
       black-and-white, it goes *wistful*. Capped at 40%: the point is a mood you
       notice without being able to name, not a filter. */
    if (offline > 0.01) {
      g.globalCompositeOperation = 'saturation';
      g.globalAlpha = offline * 0.4;
      g.fillStyle = '#808080';
      g.fillRect(0, 0, this.W, this.H);
    }

    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
}
