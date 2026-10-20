/* ============================================================================
   WaterLayer — the lake.

   Water is the hardest thing in a pixel scene to get right, and it comes down
   to four effects layered in this order:

     1. a vertical gradient (the lake is darker close to you)
     2. a REFLECTION of the sky, squashed and sinusoidally displaced per
        scanline — this is what makes it read as a surface rather than as a
        blue rectangle
     3. a specular column under whichever body is in the sky, broken into
        dashes that scroll — the "glitter path"
     4. ripple lines: short horizontal highlights that drift and fade

   All of it is per-scanline. At ~40 scanlines that's nothing, and doing it
   per-scanline is the only way the displacement can vary with depth.
   ========================================================================== */

import { Layer } from '../Layer.js';
import { px } from '../../ui/pixel.js';
import { horizon } from '../horizon.js';
import { bus } from '../../core/bus.js';
import { rgbCss, clamp, lerp, mixRgb, rng, fbm1, fbm2, TAU } from '../../core/util.js';

/* How hard the world above is compressed as it comes back up out of the water.
   Below 1, each row of lake shows more of the world — so a tall pine folds into
   a short lake instead of running out of room halfway down its own trunk. */
const SQUASH = 0.78;

export class WaterLayer extends Layer {
  constructor() {
    super({ depth: 0.42, name: 'water' });
    this.ripples = [];
    this.rings = []; // the cursor's wake
    this._ringClock = 0;

    /* Anything that hits the water asks HERE for its ripple — a cast float, a
       skipping stone, a landed fish. The ring physics already existed for the
       cursor's wake; the fishing layer reimplementing it would have given us two
       kinds of ripple that expand at subtly different rates in the same lake. */
    bus.on('water:ring', ({ x, y, strength = 1 }) => {
      if (y < this.top || y > this.bottom) return;
      this.rings.push({ x, y, r: 1, life: 0, max: 0.9 * strength });
      if (this.rings.length > 24) this.rings.shift();
    });
  }

  resize(W, H) {
    this.W = W;
    this.H = H;

    const hz = horizon(H);
    this.top = hz.waterTop;
    this.bottom = hz.waterBot;
    this.shoreY = hz.shoreY;

    const h = this.bottom - this.top;

    /* The mirror. Each frame we copy the strip of world ABOVE the shoreline into
       here in one blit, then read the reflection back out of it row by row.

       Doing it this way — rather than blitting the scene canvas onto itself 60
       times — means we never read from the texture we are actively writing to,
       which is the kind of thing a GPU will happily do and then charge you a
       pipeline flush for, once per row. */
    this._mirror = document.createElement('canvas');
    this._mirror.width = W;
    this._mirror.height = Math.ceil(h / SQUASH) + 2;
    this._mg = this._mirror.getContext('2d', { alpha: false });
    this._mg.imageSmoothingEnabled = false;

    // The ripple field scales with the lake. A fixed 34 ripples in a lake this
    // much taller would read as a sparse, empty sheet.
    const r = rng(777);
    const count = Math.round(h * 0.9);
    this.ripples = Array.from({ length: count }, () => ({
      x: r() * W,
      y: lerp(this.top + 3, this.bottom, Math.pow(r(), 0.7)),
      w: 3 + Math.floor(r() * 7),
      phase: r() * TAU,
      speed: 0.25 + r() * 0.5,
    }));
  }

  update(env) {
    const { dt, pointer, motion } = env;

    for (const r of this.ripples) {
      // Ripples drift with the wind, slowly, and wrap.
      r.x += (0.4 + env.wind * 2.2) * dt * 6 * motion;
      if (r.x > this.W + 10) r.x = -10;
    }

    /* Drag the cursor across the lake and it leaves rings.
       Rate-limited, not spawned per-frame: at 144Hz an unthrottled spawn lays
       down 144 overlapping rings a second and the lake turns into a white
       smear. Every ~60ms gives a trail of discrete, readable ripples. */
    this._ringClock -= dt;
    if (
      motion &&
      pointer.active &&
      pointer.moved > 0 &&
      pointer.y > this.top &&
      pointer.y < this.bottom &&
      this._ringClock <= 0
    ) {
      const speed = Math.hypot(pointer.vx, pointer.vy);
      if (speed > 0.4) {
        this._ringClock = 0.06;
        this.rings.push({ x: pointer.x, y: pointer.y, r: 1, life: 0, max: 0.9 });
        if (this.rings.length > 24) this.rings.shift();
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life += dt;
      // Rings expand fast then slow — a real ripple loses energy to the water.
      ring.r += dt * 34 * (1 - ring.life / ring.max) ** 0.6;
      if (ring.life > ring.max) this.rings.splice(i, 1);
    }
  }

  draw(g, env) {
    const { pal, t, sun, hour, glow, season } = env;
    const top = this.top;
    const bot = this.bottom;
    const h = bot - top;

    /* WINTER FREEZES THE LAKE — from the edges inward, which is how ice actually
       forms: the shallows lose heat first, so a half-frozen lake is a pale ring
       around a dark centre. `ice` is how far in the freeze has crept. */
    const ice = clamp(season.snow, 0, 1);

    // 1 — base body. Near water is deeper and darker.
    const shallow = mixRgb(pal.lit('#3d6b8a', 1.05), pal.sky[2], 0.35);
    const deep = pal.lit('#16283f', 0.9);

    for (let y = top; y < bot; y++) {
      const f = (y - top) / h;
      px(g, 0, y, this.W, 1, rgbCss(mixRgb(shallow, deep, Math.pow(f, 0.8))));
    }

    // 2 — the reflection.
    this._reflect(g, env);

    // 3 — the glitter path under the sun or moon.
    this._specular(g, glow, env);

    // 4 — ripple highlights.
    const hi = rgbCss(mixRgb(pal.lit('#9fd8e8', 1.15), pal.glow, 0.25));
    for (const r of this.ripples) {
      const f = (r.y - top) / h;
      // Sine on the phase makes each ripple wink in and out rather than sitting
      // there like a dash of paint.
      const a = clamp(Math.sin(t * r.speed + r.phase), 0, 1) * (0.5 - f * 0.25);
      if (a < 0.05) continue;
      const wob = Math.sin(r.y * 0.5 + t * 1.4) * (1 + f * 2);
      g.globalAlpha = a;
      px(g, r.x + wob, r.y, r.w, 1, hi);
      g.globalAlpha = 1;
    }

    // 5 — the cursor's wake. Rings, not blobs: a ripple is a hollow circle, and
    // the two arcs (near and far) are all you need for the eye to close it.
    const ringCol = rgbCss(mixRgb(pal.lit('#cfe8f5', 1.2), pal.glow, 0.2));
    for (const ring of this.rings) {
      const a = (1 - ring.life / ring.max) ** 1.5 * 0.55;
      if (a < 0.03) continue;
      const r = Math.round(ring.r);
      // Squashed vertically — we're looking at the water at an angle, so a
      // circular ripple projects as an ellipse. A round ring would read as a
      // ball lying on the surface.
      const ry = Math.max(1, Math.round(r * 0.32));

      g.globalAlpha = a;
      g.fillStyle = ringCol;
      for (let i = 0; i <= 16; i++) {
        const th = (i / 16) * TAU;
        g.fillRect(Math.round(ring.x + Math.cos(th) * r), Math.round(ring.y + Math.sin(th) * ry), 1, 1);
      }
      g.globalAlpha = 1;
    }

    // 6 — ICE. Drawn over everything: it's a lid on the lake, not a tint in it.
    if (ice > 0.03) this._ice(g, env, ice);
  }

  /**
   * THE REFLECTION.
   *
   * The lake used to reflect a flat wash of "sky colour" — a solid tint that
   * happened to be blue. It never showed the mountains, and it never showed the
   * forest, which meant the one thing water is actually for was missing: it
   * didn't have anything IN it.
   *
   * So now it reflects the world. Literally — the strip of frame above the
   * shoreline is copied, flipped, squashed, and displaced per scanline. Because
   * the forest and the mountains have already drawn themselves by the time we
   * run (we're layer 8 of 13), what lands in the water is the real treeline, the
   * real ridges, the real moon.
   *
   * Two things make it read as water rather than as a mirror:
   *   · every scanline is displaced by its own sum of two detuned sines, so the
   *     surface is MOVING and the reflection is broken up by it;
   *   · it fades with depth. You can see the far bank in the far water. The
   *     water at your feet is deep, and deep water is dark.
   */
  _reflect(g, env) {
    const { t, motion, quality, pal } = env;

    const top = this.top;
    const h = this.bottom - top;
    const srcH = this._mirror.height;

    // The strip of world we're going to reflect: `srcH` rows sitting directly on
    // top of the shoreline.
    const srcTop = this.shoreY - srcH;
    if (srcTop < 0) return;

    // One blit in. Everything after this reads from our own private copy.
    this._mg.drawImage(g.canvas, 0, srcTop, this.W, srcH, 0, 0, this.W, srcH);

    // Under load, reflect in 2px bands instead of 1px. Halves the blits, and on
    // a surface this broken up nobody has ever noticed.
    const step = quality < 0.7 ? 2 : 1;

    for (let y = top; y < this.bottom; y += step) {
      const d = (y - top) / h; // 0 at the waterline, 1 at your feet

      // Walk UP the mirror as we walk DOWN the lake. That inversion is the whole
      // trick; SQUASH decides how much world fits in how much water.
      const my = srcH - 1 - Math.round((y - top) / SQUASH);
      if (my < 0) break; // ran out of world to reflect

      /* Fades fast. A reflection that stays strong all the way to the bottom of
         the frame makes the lake look like a sheet of glass lying on the grass —
         the fade is what gives the water depth. */
      const a = (1 - d) ** 1.35 * 0.6;
      if (a < 0.02) break;

      const wob = motion
        ? Math.sin(y * 0.55 + t * 1.4) * (0.8 + d * 2.6) +
          Math.sin(y * 0.23 - t * 0.9) * (0.4 + d * 1.4)
        : 0;

      g.globalAlpha = a;
      g.drawImage(this._mirror, 0, my, this.W, 1, Math.round(wob), y, this.W, step);
    }
    g.globalAlpha = 1;

    /* The waterline itself. Where the bank meets the lake there's a bright, busy
       little seam of lapping water — without it the reflection just starts, and
       a reflection that starts at a ruled line looks like a screenshot pasted
       upside down. */
    const foam = rgbCss(mixRgb(pal.lit('#cfe8f5', 1.15), pal.glow, 0.3));
    g.globalAlpha = 0.5;
    for (let x = 0; x < this.W; x++) {
      const n = fbm1(x * 0.35 + t * 0.6, 2, 55);
      if (n > 0.56) px(g, x, top + (n > 0.72 ? 1 : 0), 1 + Math.round(n), 1, foam);
    }
    g.globalAlpha = 1;
  }

  /**
   * Ice creeps in from the shores. Two features sell it:
   *   · the EDGE is ragged (fbm), because ice doesn't freeze in a straight line;
   *   · there are CRACKS — a few pale seams radiating across the sheet. Without
   *     them a frozen lake is just a white rectangle, and with them it's ice.
   */
  _ice(g, env, ice) {
    const { pal } = env;

    /* BAKE IT. The sheet is now a 2-D field — a per-pixel decision across the
       whole lake — and drawing it live meant ~30,000 fillRects every single
       frame. It cost 4fps and it bought nothing, because ice does not move: it
       only changes when the season or the light does. So it's painted once into
       a cached canvas, exactly like the meadow's ground and the forest's trees,
       and the frame just blits it. */
    const sig = `${pal.key}|${Math.round(pal.lum * 10)}|${Math.round(ice * 20)}|${this.W}x${this.H}`;
    if (sig !== this._iceSig) {
      this._iceSig = sig;
      this._iceCv = this._bakeIce(pal, ice);
    }

    g.drawImage(this._iceCv, 0, this.top);
  }

  _bakeIce(pal, ice) {
    const h = this.bottom - this.top;

    const cv = document.createElement('canvas');
    cv.width = this.W;
    cv.height = h;
    const g = cv.getContext('2d');

    // Local coordinates now: the bake canvas starts at the waterline.
    const top = 0;
    const bot = h;

    const sheet = rgbCss(pal.lit('#b9cbe4', 1.0));   // scoured, polished ice
    const snowOnIce = rgbCss(pal.lit('#e9f1ff', 1.06)); // drifted snow on top of it
    const crack = rgbCss(pal.lit('#ffffff', 1.1));
    const rim = rgbCss(pal.lit('#eaf2ff', 1.06));

    /* The freeze used to be decided per SCANLINE — every pixel in a row was
       equally frozen — which drew the lake as a stack of horizontal bands. At
       the old size you could just about call that "ice". At the new size it was
       a flat grey slab covering a quarter of the frame, and it flattened the
       whole world.

       So the freeze is now a 2-D field, like the snow on the bank: it closes in
       from both shores, but ragged, in tongues and lobes, and it leaves the
       middle open longest — which is where the dark water and the reflection
       survive, and the only reason the picture still has any depth in January. */
    for (let y = top; y < bot; y++) {
      const f = (y - top) / h;
      const fromEdge = Math.min(f, 1 - f) * 2; // 0 at the banks, 1 mid-lake

      for (let x = 0; x < this.W; x++) {
        const lobe = fbm2(x * 0.022, y * 0.05, 2, 808) * 0.5;
        const covered = ice * 1.3 - fromEdge - lobe;
        if (covered <= 0) continue;

        /* Wind-swept snow LYING on the ice. This is what gives a frozen lake its
           texture — bare polished ice in the scoured patches, drifted snow in
           the lee. Without it the sheet is one flat colour and reads as a hole
           in the picture. */
        const drift = fbm2(x * 0.02, y * 0.06, 3, 909);

        g.globalAlpha = clamp(covered * 1.8, 0, 0.95);
        g.fillStyle = drift > 0.54 ? snowOnIce : sheet;
        g.fillRect(x, y, 1, 1);
      }

      // A brighter lip along the freeze line, where the ice is thin and wet.
      const edge = ice * 1.3 - fromEdge;
      if (edge > 0 && edge < 0.18) {
        g.globalAlpha = clamp(edge * 3.5, 0, 0.6);
        px(g, 0, y, this.W, 1, rim);
      }
      g.globalAlpha = 1;
    }

    // Cracks. Seeded, so they're the same cracks all winter — a lake whose
    // cracks reshuffle every frame is a lake made of static.
    if (ice > 0.35) {
      const r = rng(1212);
      g.globalAlpha = clamp((ice - 0.35) * 2, 0, 0.62);
      g.fillStyle = crack;
      for (let c = 0; c < 9; c++) {
        let x = r() * this.W;
        let y = top + 2 + r() * (h - 4);
        const dir = r() > 0.5 ? 1 : -1;
        for (let s = 0; s < 14 + r() * 16; s++) {
          x += dir * (1 + r() * 3);
          y += (r() - 0.5) * 1.6;
          if (y < top || y > bot || x < 0 || x > this.W) break;
          g.fillRect(Math.round(x), Math.round(y), 1, 1);
        }
      }
      g.globalAlpha = 1;
    }

    return cv;
  }

  /**
   * The specular column. Reflected light isn't a solid beam — it's a stack of
   * broken dashes that get wider and sparser as they come toward you, because
   * each is the glint off one wave facet. Getting *that* right is the whole
   * effect; a solid triangle of yellow looks like a spotlight.
   */
  _specular(g, glow, env) {
    const { pal, t, sun: sunTimes, hour, bass } = env;

    const rise = sunTimes?.sunriseHour ?? 6;
    const set = sunTimes?.sunsetHour ?? 19.5;

    // Reuse the same arc maths the sky uses, so the column is always directly
    // beneath the body — the single cheapest way to make a reflection believable.
    const isDay = hour >= rise && hour <= set;
    let f;
    if (isDay) {
      f = (hour - rise) / (set - rise);
    } else {
      let h = hour < rise ? hour + 24 : hour;
      f = (h - set) / (24 - set + rise);
    }
    const cx = this.W * lerp(0.1, 0.9, clamp(f, 0, 1));

    let veil = { clear: 1, cloudy: 0.35, fog: 0.15, rain: 0.12, snow: 0.25, storm: 0.05 }[pal.weather] ?? 1;

    /* The glitter path is where the music lands on the water. Bass widens and
       brightens the column, so a heavy track makes the whole lake shimmer — and
       because the effect rides the EXISTING dash field rather than adding new
       geometry, it costs nothing at all. */
    veil *= 1 + bass * 0.55;
    if (veil < 0.06) return;

    const col = rgbCss(isDay ? pal.glow : [225, 232, 255]);
    const top = this.top;
    const bot = this.bottom;
    const h = bot - top;

    for (let y = top + 1; y < bot; y++) {
      const d = (y - top) / h; // 0 far, 1 near

      // The column widens as it approaches — perspective on the wave field.
      const halfW = 2 + d * 26;
      // Dash length and gap both grow with depth.
      const dash = 1 + Math.floor(d * 5);
      const gap = 2 + Math.floor(d * 7);
      const scroll = t * (8 + d * 22);

      for (let x = cx - halfW; x < cx + halfW; x += dash + gap) {
        // Wobble each dash independently, and drop some at random so the column
        // is broken rather than striped.
        const j = Math.sin(x * 0.7 + y * 0.9 + t * 2.2);
        if (j < -0.25) continue;

        const wob = Math.sin(y * 0.5 + t * 1.4) * (1 + d * 2);
        // Brightest in the middle of the column, fading to the edges.
        const edge = 1 - Math.abs(x - cx) / halfW;
        const a = veil * edge * (0.35 + 0.4 * j) * (1 - d * 0.35);
        if (a < 0.05) continue;

        const px_ = x + wob + ((scroll % (dash + gap)) - gap);

        g.globalAlpha = clamp(a, 0, 1);
        px(g, px_, y, dash, 1, col);
        g.globalAlpha = 1;

        if (a > 0.45) {
          glow.globalAlpha = (a - 0.45) * 1.4;
          px(glow, px_, y, dash, 1, col);
          glow.globalAlpha = 1;
        }
      }
    }
  }
}
