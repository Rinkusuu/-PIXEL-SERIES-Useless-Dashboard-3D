/* ============================================================================
   SkyLayer — the dithered sky, and the aurora that only shows on clear nights.

   The gradient is regenerated into an offscreen canvas only when the palette
   has moved far enough to be visible (a few times per minute in normal use),
   never per frame. Blitting a cached canvas costs a memcpy; dithering 140k
   pixels costs 2ms, and 2ms every frame is 12% of the frame budget spent on a
   picture that hasn't changed.
   ========================================================================== */

import { Layer } from '../Layer.js';
import { ditherGradient, px } from '../../ui/pixel.js';
import { rgbCss, clamp, fbm1, TAU } from '../../core/util.js';

export class SkyLayer extends Layer {
  constructor() {
    super({ depth: 0, name: 'sky' });
    this._cache = null;
    this._sig = ''; // signature of the palette the cache was built from
    this._t = 0;
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this._cache = null;
  }

  update(env) {
    this._t = env.t;
  }

  /**
   * A coarse fingerprint of the palette. Quantised hard on purpose: we only
   * want a rebuild when a channel has moved by ~6/255, which is the point at
   * which a human could notice a band shift.
   */
  _signature(pal) {
    const q = (c) => `${c[0] >> 3}.${c[1] >> 3}.${c[2] >> 3}`;
    return `${q(pal.sky[0])}|${q(pal.sky[1])}|${q(pal.sky[2])}|${this.H}`;
  }

  draw(g, env) {
    const { pal, W, H } = env;

    const sig = this._signature(pal);
    if (sig !== this._sig || !this._cache) {
      this._sig = sig;
      // Only the top ~72% of the frame is sky; below that is land. Generating
      // the full height would be a third of the work thrown away.
      const skyH = Math.ceil(H * 0.72);
      this._cache = ditherGradient(
        4, // one dither tile wide — tiled horizontally below
        skyH,
        [
          { at: 0, color: pal.sky[0] },
          { at: 0.55, color: pal.sky[1] },
          { at: 1, color: pal.sky[2] },
        ],
        20
      );
      this._pattern = g.createPattern(this._cache, 'repeat-x');
    }

    const skyH = this._cache.height;
    g.save();
    g.fillStyle = this._pattern;
    g.fillRect(0, 0, W, skyH);
    g.restore();

    // Below the gradient, flood the horizon colour so the land never sits on
    // an unpainted buffer (which would show last frame's pixels).
    px(g, 0, skyH - 1, W, H - skyH + 2, rgbCss(pal.sky[2]));

    if (pal.stars > 0.5 && pal.weather === 'clear') this._aurora(g, env);
  }

  /**
   * Aurora. Three drifting ribbons of vertical scanlines whose height is driven
   * by fbm noise. Additive, drawn into BOTH buffers so it blooms.
   *
   * It appears only on clear nights, which makes a clear night feel like a
   * reward rather than just "the default with fewer clouds".
   */
  _aurora(g, env) {
    const { pal, W, glow } = env;
    const strength = clamp((pal.stars - 0.5) * 2, 0, 1) * 0.5;
    if (strength <= 0.01) return;

    const baseY = this.H * 0.12;
    const hues = [pal.accent, pal.glow, pal.accent];

    g.save();
    g.globalCompositeOperation = 'lighter';
    glow.save();
    glow.globalCompositeOperation = 'lighter';

    for (let band = 0; band < 3; band++) {
      const drift = this._t * (0.012 + band * 0.006);
      const col = hues[band];

      for (let x = 0; x < W; x += 2) {
        const n = fbm1(x * 0.012 + drift * 6 + band * 40, 3, band * 17);
        const n2 = fbm1(x * 0.03 - drift * 3 + band * 90, 2, band * 31);

        const top = baseY + band * 9 + n * 26 - 13;
        const h = 14 + n2 * 42;
        // Ribbons thin out at the edges of the frame — a hard-edged aurora
        // that runs to the bezel looks like a bug, not like the sky.
        const edge = Math.sin((x / W) * Math.PI);
        const a = strength * n2 * edge * 0.5;
        if (a < 0.01) continue;

        g.globalAlpha = a * 0.5;
        g.fillStyle = rgbCss(col);
        g.fillRect(x, Math.round(top), 2, Math.round(h));

        // The emissive copy is what actually makes it glow after the blur pass.
        glow.globalAlpha = a * 0.75;
        glow.fillStyle = rgbCss(col);
        glow.fillRect(x, Math.round(top), 2, Math.round(h * 0.7));
      }
    }

    g.globalAlpha = 1;
    glow.globalAlpha = 1;
    g.restore();
    glow.restore();
  }
}
