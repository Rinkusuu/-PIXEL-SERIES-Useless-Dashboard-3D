/* ============================================================================
   MeadowLayer — the near bank: grass, flowers, a couple of foreground blades.

   The grass is a field of individual blades that BEND. Each blade stores a base
   position and sways with a phase offset derived from its x — which means the
   wind travels across the meadow as a wave instead of every blade wiggling in
   place. That travelling wave is the entire difference between "grass in the
   wind" and "grass having a seizure".

   Flowers bob on the same wave (they're attached to the same ground) and open
   in the day, close at night.
   ========================================================================== */

import { Layer } from '../Layer.js';
import { px, BAYER4 } from '../../ui/pixel.js';
import { horizon } from '../horizon.js';
import { rgbCss, rng, clamp, lerp, mixRgb, fbm1, fbm2, TAU } from '../../core/util.js';

const FLOWER_COLORS = ['#ff8fa3', '#ffd479', '#c89bff', '#8fe0ff', '#ffffff'];

export class MeadowLayer extends Layer {
  constructor() {
    super({ depth: 0.7, name: 'meadow' });
    this.blades = [];
    this.flowers = [];
    this._sig = '';
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this.top = horizon(H).meadowTop;
    this._sig = '';

    const r = rng(31337);

    // Blades. Density and height both increase toward the viewer, which is what
    // stops the field looking like a flat texture.
    const count = Math.round(W * 1.5);
    this.blades = Array.from({ length: count }, () => {
      const d = Math.pow(r(), 0.6); // bias toward the front
      const y = lerp(this.top, H + 6, d);
      return {
        x: r() * (W + 20) - 10,
        y,
        h: lerp(3, 11, d) + r() * 3,
        depth: d,
        // The phase is a function of x, so neighbours move together.
        lean: r() > 0.5 ? 1 : -1,
        tone: r(),
      };
    });
    this.blades.sort((a, b) => a.y - b.y); // painter's algorithm

    this.flowers = Array.from({ length: 46 }, () => {
      const d = Math.pow(r(), 0.7);
      return {
        x: r() * W,
        y: lerp(this.top + 4, H - 2, d),
        depth: d,
        color: FLOWER_COLORS[Math.floor(r() * FLOWER_COLORS.length)],
        size: r() > 0.7 ? 2 : 1,
        phase: r() * TAU,
      };
    });
    this.flowers.sort((a, b) => a.y - b.y);
  }

  /**
   * How deep the snow lies at a point on the bank, 0–1.
   *
   * The ground bake and the grass blades BOTH call this, and that is the whole
   * point of it being a function. When the snow was baked from one noise field
   * and the blades knew nothing about it, the winter meadow was a full summer
   * lawn standing at attention through a snowdrift. Snow buries things.
   *
   * @param yLocal — y measured from the top of the bank, not from the frame.
   */
  _snowAt(x, yLocal, h, snow) {
    // Real 2-D noise. The old code passed `x * 0.05 + y * 0.11` to the 1-D fbm,
    // which gives every point along a diagonal the same value — so the snow fell
    // in stripes, like a combed field. That was the "weird ground in the snow".
    const n = fbm2(x * 0.035, yLocal * 0.09, 3, 404);

    // Deeper away from the viewer: drifts pile against the treeline.
    return snow * (0.5 + n * 0.85) * (1 - (yLocal / h) * 0.35);
  }

  /** Bake the ground itself — a dithered slab. Blades go on top, live. */
  _bake(pal, season, snow) {
    const cv = document.createElement('canvas');
    cv.width = this.W;
    cv.height = this.H - this.top + 2;
    const g = cv.getContext('2d');
    const h = cv.height;

    // The ground's colour is the SEASON's, lit by the hour. Summer green,
    // autumn straw, winter slate — and every shade between, because the season
    // module interpolates continuously.
    const far = pal.lit(season.grassFar, 0.92);
    const near = pal.lit(season.grassNear, 0.8);

    for (let y = 0; y < h; y++) {
      const f = y / h;
      const c = mixRgb(far, near, Math.pow(f, 0.7));
      g.fillStyle = rgbCss(c);
      g.fillRect(0, y, this.W, 1);

      // Dithered scatter of a lighter tone: texture, not noise. Also 2-D now —
      // the diagonal banding was subtler here than in the snow, but it was the
      // same bug, and it was visible in every season once you knew to look.
      if (y % 2 === 0) {
        g.fillStyle = rgbCss(mixRgb(c, pal.glow, 0.06));
        for (let x = (y % 4); x < this.W; x += 7) {
          if (fbm2(x * 0.12, y * 0.3, 2, 12) > 0.55) g.fillRect(x, y, 2, 1);
        }
      }
    }

    /* SNOW. Not a white wash over the top — that produces a flat grey sheet and
       kills the ground entirely. Snow LIES on things: it settles in patches,
       thicker where the fbm says there's a hollow, and the bare ground shows
       through at the edges. Drawn as a dithered mask so it reads as accumulated
       depth rather than as paint. */
    if (snow > 0.02) {
      const snowCss = rgbCss(pal.lit('#e8f0ff', 1.06));
      const snowDeep = rgbCss(pal.lit('#c4d4ea', 0.95));

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < this.W; x++) {
          const depth = this._snowAt(x, y, h, snow);

          /* ORDERED DITHER, not an ad-hoc one.

             This used to threshold on `(x + y * 2) % 3`, which is a periodic
             lattice, not a dither. Over a smooth depth field that lattice
             doesn't dissolve — it RESOLVES, into a hard 1px checkerboard, and
             the bottom of the winter meadow was covered in little chessboards.

             A Bayer threshold spreads the same transition across a 4×4 cell in
             the order the eye is least able to reconstruct, so the snow's edge
             crumbles into the grass instead of tiling. It's the same matrix the
             sky gradient uses, three files away. */
          const bayer = BAYER4[y & 3][x & 3] / 16;

          if (depth < 0.40 + bayer * 0.24) continue;

          // Dither the two snow tones against each other too, or the boundary
          // between "deep" and "lit" snow is its own hard edge.
          g.fillStyle = depth > 0.64 + bayer * 0.16 ? snowCss : snowDeep;
          g.fillRect(x, y, 1, 1);
        }
      }
    }

    /* The bank's edge: a lighter lip where the meadow meets the water.

       It was a continuous 1px line of light running the full width of the frame,
       and at the lake's new size it stopped reading as a shoreline and started
       reading as a RULE — a drawn border between two pictures. A shore is the
       one thing in a landscape that must never look straight. So it's broken now,
       and it wears snow in winter instead of sunlight. */
    const lip = snow > 0.4
      ? rgbCss(pal.lit('#e8f0ff', 1.04))
      : rgbCss(mixRgb(far, pal.glow, 0.25));

    for (let x = 0; x < this.W; x++) {
      const n = fbm1(x * 0.18, 3, 71);
      if (n < 0.36) continue; // gaps: the lip is broken, not continuous
      g.fillStyle = lip;
      g.fillRect(x, Math.round(n * 3), 1, n > 0.72 ? 2 : 1);
    }

    return cv;
  }

  draw(g, env) {
    const { pal, t, wind, quality, motion, season, pointer } = env;

    /* The snow depth joins the bake signature, QUANTISED to 14 steps.

       The bake is a per-pixel loop over the entire meadow, and the snow now
       creeps up continuously over about two minutes — so keying the bake on the
       raw value would rebuild the ground on every single frame of a snowfall.
       Fourteen steps is finer than the eye can follow on a slab that dithers its
       own edges, and it costs fourteen bakes for a blizzard instead of seven
       thousand. */
    const snow = env.snow ?? season.snow;
    const sig = `${pal.key}|${Math.round(pal.lum * 10)}|${pal.weather}|${this.W}x${this.H}|${season.key}|${Math.round(season.blend * 6)}|${Math.round(snow * 14)}`;
    if (sig !== this._sig) {
      this._sig = sig;
      this._ground = this._bake(pal, season, snow);

      /* Work out, once, how deep each blade is buried. The blades never move, so
         this is a per-season cost, not a per-frame one — and sampling the noise
         for 750 blades every frame would be a real bill for a fact that cannot
         change between frames. */
      const gh = this.H - this.top + 2;
      for (const b of this.blades) {
        b.snow = snow > 0.02
          ? clamp(this._snowAt(b.x, b.y - this.top, gh, snow), 0, 1)
          : 0;
      }
    }

    const ox = this.ox(env);
    const oy = this.oy(env) * 0.5;

    g.drawImage(this._ground, Math.round(ox * 0.3), Math.round(this.top + oy));

    /* The travelling wind wave. `x * 0.06` is the spatial frequency — the
       wavelength of a gust across the meadow — and `t * 1.6` is how fast the
       gust travels. Both were tuned by eye until it stopped looking like a
       texture scrolling and started looking like air moving. */
    const gust = (0.35 + wind * 1.6) * motion;

    const bladeLight = pal.lit(season.bladeLight, 1.05);
    const bladeDark = pal.lit(season.bladeDark, 0.9);

    // Under load, thin the field. Blades are sorted by depth, so skipping every
    // Nth removes them evenly instead of carving a hole.
    const stride = quality < 0.7 ? 2 : 1;

    // The cursor's reach, in scene pixels. Grass within this radius bends away.
    const PART = 26;
    const parting = motion && pointer.active;

    // Below this, a blade is under the drift and simply isn't there any more.
    const BURIED = 0.78;

    for (let i = 0; i < this.blades.length; i += stride) {
      const b = this.blades[i];

      /* SNOW BURIES GRASS. This is the difference between a winter meadow and a
         summer meadow that someone has thrown flour over. Where the drift is
         deep the blade is gone entirely; at the drift's edges it's a short tuft
         poking through. The blades and the snow read the same noise field, so
         the tufts appear exactly where the snow is thin — which is what makes it
         look like snow lying ON something rather than a white layer in front. */
      const buried = b.snow || 0;
      if (buried > BURIED) continue;
      const bh = b.h * (1 - (buried / BURIED) * 0.85);

      let sway =
        Math.sin(b.x * 0.06 - t * 1.6) * gust * (0.6 + b.depth * 1.6) +
        Math.sin(b.x * 0.19 - t * 3.1) * gust * 0.4 * b.depth;

      // A half-buried blade is held by the snow; it barely moves.
      sway *= 1 - buried * 0.8;

      const x = b.x + ox * b.depth;
      const y = b.y + oy;

      /* THE CURSOR PARTS THE GRASS.
         Blades near the pointer lean AWAY from it, hardest at the centre and
         tapering to nothing at the edge of the radius. Two details do all the
         work here:
           · the falloff is squared, so there's no visible circular boundary —
             a linear falloff leaves a hard disc edge that reads as a bug;
           · it uses the horizontal distance for direction but the full 2-D
             distance for strength, so the grass parts sideways (like something
             walking through it) rather than radially (like an explosion). */
      if (parting) {
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < PART) {
          const push = (1 - d / PART) ** 2;
          sway += Math.sign(dx || 1) * push * 9 * (0.5 + b.depth);
        }
      }

      const col = rgbCss(mixRgb(bladeDark, bladeLight, b.tone * 0.7 + b.depth * 0.3));

      // Draw the blade as 3 stacked segments, each leaning a bit further —
      // a cheap 3-joint bend that reads as a bending stalk, not a tilted stick.
      const seg = bh / 3;
      for (let s = 0; s < 3; s++) {
        const f = (s + 1) / 3;
        const dx = sway * f * f; // quadratic: the tip travels furthest
        g.fillStyle = col;
        g.fillRect(
          Math.round(x + dx),
          Math.round(y - seg * (s + 1)),
          b.depth > 0.6 ? 2 : 1,
          Math.ceil(seg) + 1
        );
      }
    }

    this._flowers(g, env, ox, oy, gust);
  }

  _flowers(g, env, ox, oy, gust) {
    const { pal, t, glow, season } = env;
    // Flowers close at night — petals fold, only the stem is left.
    const open = clamp(pal.lum * 1.6, 0.15, 1);

    // Winter kills all but a stubborn handful. `season.flowers` is a fraction,
    // and because the flower list is in a stable order, taking the first N of it
    // means the SAME flowers survive each winter — not a new random selection
    // every frame, which would make them strobe.
    const alive = Math.round(this.flowers.length * season.flowers);

    for (let fi = 0; fi < alive; fi++) {
      const f = this.flowers[fi];
      const sway = Math.sin(f.x * 0.06 - t * 1.6) * gust * (0.6 + f.depth * 1.6);
      const x = f.x + ox * f.depth + sway * 1.2;
      const y = f.y + oy;
      const stemH = 4 + f.depth * 5;

      // Stem — the season's own green, so it doesn't stay summer-fresh in the snow.
      px(g, x, y - stemH, 1, stemH, rgbCss(pal.lit(season.bladeDark, 1.05)));

      const s = f.size;
      const petal = rgbCss(pal.lit(f.color, 1.15));
      const core = rgbCss(pal.lit('#ffe9a8', 1.2));

      if (open > 0.5) {
        // Open: four petals around a bright core, on the pixel cross.
        const cy = y - stemH;
        px(g, x - s, cy, s, s, petal); // left
        px(g, x + 1, cy, s, s, petal); // right
        px(g, x, cy - s, s, s, petal); // top
        px(g, x, cy + 1, s, s, petal); // bottom
        px(g, x, cy, 1, 1, core); // centre
      } else {
        // Closed: a bud.
        px(g, x, y - stemH - 1, 1, 2, petal);
      }

      // Night-blooming flowers get a faint glow. Because they should.
      if (pal.night && f.color === '#c89bff') {
        glow.globalAlpha = 0.35;
        px(glow, x - 1, y - stemH - 2, 3, 3, petal);
        glow.globalAlpha = 1;
      }
    }
  }
}
