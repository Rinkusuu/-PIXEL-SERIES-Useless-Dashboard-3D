/* ============================================================================
   ForestLayer — the far tree line on the opposite shore, plus a lone cottage
   with a lit window and a chimney that smokes.

   The treeline is baked (it's a static silhouette). The cottage window, the
   smoke and the lantern are drawn live, because they're the things your eye
   goes to: a single warm rectangle in a cold blue landscape is the entire
   emotional payload of this layer.
   ========================================================================== */

import { Layer } from '../Layer.js';
import { horizon } from '../horizon.js';
import { px, glowDot } from '../../ui/pixel.js';
import { rgbCss, rng, clamp, lerp, mixRgb, fbm1, TAU } from '../../core/util.js';

export class ForestLayer extends Layer {
  constructor() {
    super({ depth: 0.38, name: 'forest' });
    this._sig = '';
    this.smoke = [];
    this._smokeTimer = 0;
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this._sig = '';
    this.shoreY = horizon(H).shoreY;
    this.cottage = { x: Math.round(W * 0.735), y: this.shoreY - 20 };
  }

  _bake(pal, season) {
    const W = this.W + 160;
    const H = this.H;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');

    const dark = rgbCss(pal.lit(season.treeDark, 0.75));
    const mid = rgbCss(pal.lit(season.treeMid, 0.9));
    const lit = rgbCss(mixRgb(pal.lit(season.treeLit), pal.glow, 0.22));
    const snowCss = rgbCss(pal.lit('#e8f0ff', 1.05));
    const trunk = rgbCss(pal.lit('#3a2c24', 0.8));

    /* Winter strips the canopy. `bare` runs 0→1 as the season turns, and it does
       two things at once: it thins the canopy tiers away, and it reveals the
       trunk beneath.

       But it used to do that to EVERY tree — and the trees here are, by this
       file's own admission two lines down, conifers. Conifers do not drop their
       needles. A pine forest that goes bald in January isn't a winter forest,
       it's a picket fence, and that is exactly what the treeline looked like:
       eighty vertical brown sticks in a row.

       So the wood is mixed now. Most of it is evergreen and simply gets buried
       in snow; the rest is deciduous and goes properly bare. The bare ones read
       as bare BECAUSE the pines beside them didn't. */
    const bare = clamp(season.snow, 0, 1);

    const r = rng(9021);

    // A ragged band of trees of varying height. Drawn back-to-front by size so
    // the small ones tuck behind the big ones.
    const trees = [];
    for (let x = -20; x < W + 20; x += 3 + Math.floor(r() * 4)) {
      const h = 10 + fbm1(x * 0.05, 3, 5) * 22 + r() * 6;
      trees.push({
        x,
        h,
        w: 3 + Math.floor(r() * 3),
        lean: r() > 0.5,
        evergreen: r() > 0.35, // ~2 in 3 keep their needles all winter
      });
    }
    trees.sort((a, b) => a.h - b.h);

    for (const t of trees) {
      const baseY = this.shoreY;
      const topY = baseY - t.h;

      // An evergreen never goes bare, whatever the season thinks.
      const bareT = t.evergreen ? 0 : bare;

      // Trunk. On a bare tree it's exposed all the way up; otherwise only its
      // foot shows below the canopy.
      g.fillStyle = trunk;
      g.fillRect(t.x, Math.round(lerp(baseY - 3, topY + 2, bareT)), 1, Math.round(lerp(3, t.h - 2, bareT)));

      /* A bare deciduous tree is not a pole. Give it a few branches, or it reads
         as a fence post — which is the other half of why the winter treeline
         looked like a barcode. */
      if (bareT > 0.55) {
        g.globalAlpha = bareT;
        for (let i = 0; i < 3; i++) {
          const by = topY + 3 + i * (t.h / 4);
          const dir = i % 2 === 0 ? 1 : -1;
          const len = Math.max(2, Math.round((t.h / 5) * (1 - i * 0.22)));
          g.fillRect(t.x + (dir > 0 ? 1 : -len), Math.round(by), len, 1);
        }
        g.globalAlpha = 1;
      }

      // Canopy: stacked triangles, widening downward. Winter eats them from the
      // top down, so a half-bare tree keeps its lower skirt — which is exactly
      // how a real conifer sheds and how a real deciduous tree looks in November.
      const tiers = Math.max(2, Math.round(t.h / 6));
      const kept = Math.round(tiers * (1 - bareT * 0.82));

      for (let i = 0; i < tiers; i++) {
        if (i < tiers - kept) continue; // the missing (upper) tiers
        const f = i / tiers;
        const ty = Math.round(lerp(topY, baseY - 2, f));
        const tw = Math.round(1 + f * (t.w + 2));
        g.fillStyle = i < tiers * 0.4 ? mid : dark;
        g.fillRect(t.x - tw, ty, tw * 2 + 1, Math.ceil(t.h / tiers) + 1);

        // Snow settles on the TOP of each remaining tier. A single lit pixel row
        // per tier, and suddenly the whole treeline is laden.
        if (season.snow > 0.15) {
          g.globalAlpha = clamp(season.snow, 0, 1) * 0.9;
          g.fillStyle = snowCss;
          g.fillRect(t.x - tw + 1, ty, tw * 2 - 1, 1);
          g.globalAlpha = 1;
        }
      }

      // A rim of light on the sun side of the crown.
      if (bareT < 0.7) {
        g.globalAlpha = 1 - bareT;
        g.fillStyle = lit;
        g.fillRect(t.x + 1, topY, 1, Math.max(2, Math.round(t.h * 0.3)));
        g.globalAlpha = 1;
      }
    }

    // Shoreline: a hard, slightly ragged edge where the land meets the lake.
    for (let x = 0; x < W; x++) {
      const jag = Math.round(fbm1(x * 0.2, 2, 33) * 2);
      g.fillStyle = dark;
      g.fillRect(x, this.shoreY + jag, 1, 4);
      if (season.snow > 0.15) {
        g.globalAlpha = clamp(season.snow, 0, 1);
        g.fillStyle = snowCss;
        g.fillRect(x, this.shoreY + jag, 1, 1);
        g.globalAlpha = 1;
      }
    }

    return cv;
  }

  update(env) {
    const { dt, wind, pal } = env;

    // The chimney only smokes when it's cold or dark — i.e. when someone would
    // actually have lit the fire.
    const smoking = pal.lum < 0.6 || pal.weather === 'snow' || pal.weather === 'rain';

    this._smokeTimer -= dt;
    if (smoking && this._smokeTimer <= 0) {
      this._smokeTimer = 0.55 + Math.random() * 0.5;
      this.smoke.push({
        x: this.cottage.x + 12,
        y: this.cottage.y - 2,
        life: 0,
        max: 4.5 + Math.random() * 2,
        drift: (Math.random() - 0.5) * 4,
        size: 1.5 + Math.random(),
      });
    }

    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.life += dt;
      s.y -= dt * 5;
      // Smoke accelerates sideways as it rises and the wind gets hold of it.
      s.x += (s.drift + wind * 9) * dt * (0.3 + s.life * 0.3);
      s.size += dt * 0.9;
      if (s.life > s.max) this.smoke.splice(i, 1);
    }
  }

  draw(g, env) {
    const { pal, t, glow, season } = env;

    const sig = `${pal.key}|${Math.round(pal.lum * 10)}|${pal.weather}|${this.W}x${this.H}|${season.key}|${Math.round(season.blend * 6)}`;
    if (sig !== this._sig) {
      this._sig = sig;
      this._sprite = this._bake(pal, season);
    }

    const ox = this.ox(env);
    const oy = this.oy(env);

    g.drawImage(this._sprite, Math.round(-80 + ox), Math.round(oy));

    this._cottage(g, glow, this.cottage.x + ox, this.cottage.y + oy, pal, t);
    this._drawSmoke(g, pal, ox, oy);
  }

  _cottage(g, glow, x, y, pal, t) {
    const wall = rgbCss(pal.lit('#8a6a52'));
    const roof = rgbCss(pal.lit('#5a3f38'));
    const dark = rgbCss(pal.lit('#3a2a26', 0.8));

    // Body.
    px(g, x, y + 8, 20, 12, wall);
    // Roof — two stepped slopes, the pixel way to draw a pitch.
    for (let i = 0; i < 6; i++) {
      px(g, x - 2 + i, y + 8 - i, 24 - i * 2, 2, roof);
    }
    // Chimney.
    px(g, x + 12, y - 2, 4, 7, dark);
    // Door.
    px(g, x + 3, y + 13, 4, 7, dark);

    /* The window. This is the point of the whole layer.
       It's warm when the house would be lit — dusk through dawn — and it
       flickers, because a hearth flickers. */
    const litness = clamp(1 - pal.lum * 1.5, 0, 1);
    if (litness > 0.05) {
      const flicker = 0.82 + 0.18 * Math.sin(t * 7.3) * Math.sin(t * 2.1);
      const a = litness * flicker;

      g.globalAlpha = a;
      px(g, x + 12, y + 12, 5, 5, rgbCss([255, 214, 138]));
      px(g, x + 13, y + 13, 3, 3, rgbCss([255, 240, 200]));
      g.globalAlpha = 1;

      glow.globalAlpha = a * 0.9;
      glowDot(glow, x + 14, y + 14, 9, rgbCss([255, 200, 120]), 1);
      glow.globalAlpha = 1;
    }
  }

  _drawSmoke(g, pal, ox, oy) {
    const col = pal.lit('#c8ccd8', 1);
    for (const s of this.smoke) {
      const f = s.life / s.max;
      // Fade in fast, out slow — smoke appears at the chimney and dissolves.
      const a = clamp(Math.sin(f * Math.PI), 0, 1) * 0.28;
      if (a < 0.02) continue;
      g.globalAlpha = a;
      px(g, s.x + ox, s.y + oy, Math.round(s.size), Math.round(s.size), rgbCss(col));
      g.globalAlpha = 1;
    }
  }
}
