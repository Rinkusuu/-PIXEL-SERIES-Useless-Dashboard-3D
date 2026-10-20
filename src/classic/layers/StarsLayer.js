/* ============================================================================
   StarsLayer — a seeded star field with per-star twinkle, plus shooting stars.

   The field is generated once from a fixed seed, so the constellations are the
   same every night. That's not laziness — a sky whose stars reshuffle on every
   reload never becomes *your* sky.
   ========================================================================== */

import { Layer } from '../Layer.js';
import { dot, glowDot, pxText, textWidth } from '../../ui/pixel.js';
import { horizon } from '../horizon.js';
import { planetPositions } from '../../sky/planets.js';
import { STAR_COUNT } from '../../sky/stars.js';
import { bus } from '../../core/bus.js';
import { store } from '../../core/store.js';
import { play } from '../../core/play.js';
import { unlock } from '../../core/achievements.js';
import { rgbCss, rng, clamp, TAU, lerp } from '../../core/util.js';


const RAD = Math.PI / 180;

/** How close a click has to land, in scene pixels, to mean "that star". */
const PICK_RADIUS = 9;

/* And how close to mean "that shooting star". Wider, and it has to be: the thing
   crosses a 500px world in about three seconds. This is a reflex, not an aim. */
const WISH_RADIUS = 16;

export class StarsLayer extends Layer {
  constructor() {
    super({ depth: 0.06, name: 'stars' });
    this.stars = [];
    this.shooting = null;
    this._nextShot = 6 + Math.random() * 14;

    /* THE WANDERERS.

       190 of the lights up there are frozen in a seed. These four are not: they
       are Venus, Jupiter, Mars and Saturn, computed from Kepler's elements for
       your latitude, your longitude and this minute — and they will be somewhere
       else next month, because that is what planets do and it is why the Greeks
       named them "wanderers" while calling everything else "fixed".

       They are recomputed once a scene-minute. Planets move in arcminutes per
       hour; doing this 60 times a second would be a way of getting the same
       answer 3600 times. */
    this.planets = [];
    this._planetKey = '';

    /* CONSTELLATIONS.

       The star field is seeded, and has been from the beginning, for a reason
       the original comment gets exactly right: "a sky whose stars reshuffle on
       every reload never becomes *your* sky." This is the payoff of that
       decision. Because star #57 is in the same place tonight as it was last
       Tuesday, a line you draw between two stars MEANS something, and can be
       saved as two integers, and will still be pointing at the same two stars a
       year from now.

       You could not build this on a random sky. It's a feature that was quietly
       paid for, months early, by one call to rng(20260713). */
    this.drawing = []; // star indices in the line you're currently drawing
    this.saved = store.get('stars') || [];

    bus.on('play', ({ mode }) => {
      if (mode !== 'stars') this._commit();
    });

    bus.on('scene:click', (p) => {
      if (play.mode !== 'stars') return;
      this._pick(p);
    });

    /* The panel asks; the sky answers. It can't just empty the store itself,
       because `saved` lives up here — a cleared store and a full `saved` would
       write every "forgotten" constellation straight back on the next commit. */
    bus.on('stars:clear', () => this._clear());
    bus.on('stars:forget', (i) => this._forget(i));
    bus.on('stars:name', ({ index, name }) => this._name(index, name));

    // Enter finishes the constellation. Escape throws it away.
    addEventListener('keydown', (e) => {
      if (play.mode !== 'stars') return;
      // ...unless you're typing a name, in which case those keys are the panel's.
      if (e.target?.closest?.('input, textarea')) return;
      if (e.key === 'Enter') { e.preventDefault(); this._commit(); }
      if (e.key === 'Escape' && this.drawing.length) { e.preventDefault(); this.drawing = []; }
    });
  }

  /** Nearest star to the click, if one is close enough to have been meant. */
  _pick({ x, y }) {
    if (this._wish(x, y)) return;

    if (!this._starsVisible) {
      bus.emit('toast', { icon: '✨', text: 'Wait for dark. They are up there.' });
      return;
    }

    let best = -1;
    let bestD = PICK_RADIUS;

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const d = Math.hypot(s.x + this._ox - x, s.y + this._oy - y);
      if (d < bestD) { bestD = d; best = i; }
    }

    if (best < 0) return;

    // Clicking the last star again closes the constellation.
    if (this.drawing.length && this.drawing[this.drawing.length - 1] === best) {
      return this._commit();
    }
    if (this.drawing.includes(best)) return;

    this.drawing.push(best);
    bus.emit('sfx', this.drawing.length === 1 ? 'pop' : 'type');
  }

  /* A wish, if you were fast enough.

     The shooting star is unlike everything else you can click here: it is not
     waiting for you. It exists for a second and a half and then it is gone
     forever, and no amount of skill makes another one come. So the wish costs
     nothing, grants nothing, and cannot be farmed — which makes it the purest
     thing in the whole dashboard. */
  _wish(x, y) {
    const s = this.shooting;
    if (!s || s.wished) return false;
    if (Math.hypot(s.x - x, s.y - y) > WISH_RADIUS) return false;

    s.wished = true;
    const n = store.update('wishes', (w) => (w || 0) + 1);

    bus.emit('sfx', 'fanfare');
    bus.emit('toast', { icon: '🌠', text: 'You wished. Nothing will come of it.', ms: 4500 });
    bus.emit('wish', { count: n });

    unlock('wisher');
    return true;
  }

  /** Keep it. Two stars is a line, and a line is enough to be a constellation. */
  _commit() {
    if (this.drawing.length < 2) {
      this.drawing = [];
      return;
    }

    this.saved = [...this.saved, { pts: this.drawing, at: Date.now(), name: '' }];
    store.set('stars', this.saved);
    this.drawing = [];

    bus.emit('sfx', 'fanfare');
    bus.emit('toast', {
      icon: '✨',
      text: 'It is yours now. It will be there tomorrow.',
      ms: 4500,
    });

    // `naming` is the panel's cue to offer the input. The hint has promised you
    // could name it since the first commit; now the promise is kept.
    bus.emit('constellation', {
      count: this.saved.length,
      index: this.saved.length - 1,
      naming: true,
    });

    unlock('stargazer');
    if (this.saved.length >= 3) unlock('stargazer3');
  }

  /** Naming is optional, and staying nameless is a legitimate answer. */
  _name(index, name) {
    const c = this.saved[index];
    if (!c) return;

    c.name = String(name).trim().slice(0, 16);
    store.set('stars', this.saved);

    if (c.name) {
      bus.emit('sfx', 'confirm');
      unlock('namer');
    }
    bus.emit('constellation', { count: this.saved.length });
  }

  /** Forget one. The stars stay; only the line between them goes. */
  _forget(index) {
    if (!this.saved[index]) return;

    this.saved = this.saved.filter((_, i) => i !== index);
    store.set('stars', this.saved);

    bus.emit('sfx', 'pop');
    bus.emit('constellation', { count: this.saved.length });
  }

  /** Give the sky back. Irreversible — which is why the panel asks twice. */
  _clear() {
    if (!this.saved.length) return;

    this.saved = [];
    this.drawing = [];
    store.set('stars', []);

    bus.emit('sfx', 'page');
    bus.emit('toast', { icon: '✨', text: 'The sky is just stars again.', ms: 4000 });
    bus.emit('constellation', { count: 0 });
  }

  resize(W, H) {
    this.W = W;
    this.H = H;

    /* The lowest a name may hang. The forest stands on the shore and its tallest
       trees top out 38px above it (ForestLayer's `10 + fbm·22 + r·6`), and the
       forest draws AFTER us — so a name hung any lower is a name that gets
       painted over by a tree. The shoreline itself comes from horizon.js,
       because five layers guessing at one fraction is exactly the bug that file
       was written to end. */
    this.canopy = horizon(H).shoreY - 38;

    const r = rng(20260713); // the sky is the same sky every night
    this.stars = Array.from({ length: STAR_COUNT }, () => {
      const size = r() > 0.93 ? 2 : 1; // a handful of bright ones
      return {
        x: r() * W,
        // Stars crowd toward the zenith; almost none sit on the horizon, where
        // atmosphere would have eaten them anyway.
        y: Math.pow(r(), 1.7) * H * 0.6,
        size,
        base: 0.35 + r() * 0.65,
        speed: 0.6 + r() * 2.4,
        phase: r() * TAU,
        warm: r() > 0.7, // a few are gold instead of white
      };
    });
  }

  /* The scene's own clock, as a real instant. `env.hour` is the live local time
     unless you froze it from the topbar — and if you froze it, the planets move
     to where they would be at that hour. Scrub the clock to 3am and watch Saturn
     climb. Nothing else in the app rewards that as directly. */
  _updatePlanets(env) {
    const key = `${Math.floor(env.hour * 60)}|${env.lat}|${env.lon}`;
    if (key === this._planetKey) return;
    this._planetKey = key;

    const d = new Date();
    d.setHours(Math.floor(env.hour), Math.round((env.hour % 1) * 60), 0, 0);

    this.planets = planetPositions(d, env.lat ?? 45, env.lon ?? 0);
  }

  update(env) {
    this._updatePlanets(env);

    // Shooting stars: only worth simulating when there's a night to see them in.
    if (env.pal.stars < 0.4) return;

    if (this.shooting) {
      const s = this.shooting;
      s.x += s.vx * env.dt;
      s.y += s.vy * env.dt;
      s.life -= env.dt;
      if (s.life <= 0 || s.x > this.W + 40 || s.y > this.H * 0.7) this.shooting = null;
      return;
    }

    this._nextShot -= env.dt;
    if (this._nextShot <= 0) {
      this._nextShot = 14 + Math.random() * 30;
      const fromLeft = Math.random() > 0.5;
      this.shooting = {
        x: fromLeft ? -20 : this.W + 20,
        y: Math.random() * this.H * 0.28,
        vx: (fromLeft ? 1 : -1) * (110 + Math.random() * 90),
        vy: 40 + Math.random() * 50,
        life: 1.6,
        trail: [],
      };
    }
  }

  draw(g, env) {
    const { pal, t, glow } = env;
    const vis = pal.stars;
    if (vis <= 0.02) return;

    const ox = this.ox(env);
    const oy = this.oy(env);

    const white = rgbCss([236, 240, 255]);
    const gold = rgbCss(pal.sun);

    for (const s of this.stars) {
      // Twinkle: two detuned sines so the pattern never visibly loops.
      const tw =
        0.62 +
        0.38 * Math.sin(t * s.speed + s.phase) * Math.sin(t * s.speed * 0.37 + s.phase * 2);
      const a = clamp(s.base * tw * vis, 0, 1);
      if (a < 0.04) continue;

      const x = s.x + ox;
      const y = s.y + oy;
      const col = s.warm ? gold : white;

      g.globalAlpha = a;
      dot(g, x, y, col, s.size);
      g.globalAlpha = 1;

      // Only the big, bright stars earn a bloom — bloom on all 190 would turn
      // the sky into a milky smear.
      if (s.size === 2 && a > 0.6) {
        glow.globalAlpha = (a - 0.6) * 2.2;
        dot(glow, x, y, col, 2);
        glow.globalAlpha = 1;
      }
    }

    this._drawPlanets(g, glow, vis, ox, oy);

    if (this.shooting) this._drawShootingStar(g, glow, this.shooting, vis, pal);

    this._drawConstellations(g, glow, env, vis, ox, oy);
  }

  _drawPlanets(g, glow, vis, ox, oy) {
    if (vis <= 0.02) return;

    const skyline = horizon(this.H).skyline;

    for (const p of this.planets) {
      if (p.alt < 1) continue; // set, or not yet risen. Honest either way.

      /* x comes from the hour angle — the same left-to-right sweep the sun and
         moon make, because it is the same sky turning. y comes from the real
         altitude, so a planet low over the treeline is genuinely low over the
         treeline, and you could walk outside and check. */
      const x = this.W * lerp(0.1, 0.9, clamp((p.ha + 90) / 180, 0, 1)) + ox;
      const y = skyline - Math.sin(p.alt * RAD) * (this.H * 0.42) + oy;

      /* AND THEY DO NOT TWINKLE. This is the detail the whole feature is for.

         A star is a point source, and the atmosphere shreds a point into a
         flicker. A planet is a tiny disc — many points, whose flickers average
         out — so it burns steadily. It is how you pick one out with the naked
         eye from a back garden, and here it means these four dots hold perfectly
         still while all 190 stars around them are breathing. Nobody will read
         that in a changelog. Everybody will feel it. */
      /* A planet outshines the stars around it, so it must never be dimmer than
         one. A star's alpha is `base · twinkle · vis`, and `base` alone can drop
         to 0.35 — so anchoring the planets at 0.8·vis and up puts them at the
         top of the field, where they belong, at every hour of the night. */
      const a = clamp(vis * (0.8 + p.bloom * 0.2), 0, 1);
      const col = rgbCss(p.rgb);

      g.globalAlpha = a;
      dot(g, x, y, col, p.size);
      g.globalAlpha = 1;

      // Venus earns a real bloom; Saturn earns almost none. That ranking is not
      // a taste, it's their magnitudes.
      if (p.bloom > 0.15) {
        glow.globalAlpha = a * p.bloom * 0.8;
        glowDot(glow, x, y, 2 + p.bloom * 3, col, 0.9);
        glow.globalAlpha = 1;
      }
    }
  }

  _drawConstellations(g, glow, env, vis, ox, oy) {
    const { pal, t } = env;

    // Cached for the click handler, which has no env of its own.
    this._ox = ox;
    this._oy = oy;
    this._starsVisible = vis > 0.35;

    if (vis <= 0.05) return;

    const line = (pts, alpha, col) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = this.stars[pts[i]];
        const b = this.stars[pts[i + 1]];
        if (!a || !b) continue;

        const x0 = a.x + ox;
        const y0 = a.y + oy;
        const x1 = b.x + ox;
        const y1 = b.y + oy;

        // Walk the line a pixel at a time. `lineTo` on a 500px buffer with
        // imageSmoothing off gives you a jagged, half-transparent mess; stepping
        // it ourselves gives a clean 1px pixel-art line.
        const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
        g.globalAlpha = alpha;
        g.fillStyle = col;
        for (let k = 0; k <= steps; k++) {
          const f = k / steps;
          // Dashed. A solid line between two stars looks like a UI overlay; a
          // broken one looks like something you imagined into the sky.
          if (k % 3 === 2) continue;
          g.fillRect(Math.round(lerp(x0, x1, f)), Math.round(lerp(y0, y1, f)), 1, 1);
        }
        g.globalAlpha = 1;
      }
    };

    const col = rgbCss(pal.glow);

    // The ones you've kept. Faint — they're memories, not UI.
    for (const c of this.saved) line(c.pts, 0.3 * vis, col);

    /* And their names, fainter still, and only once the sky is genuinely dark.
       A label is the most UI-shaped object that will ever appear in this scene,
       so it arrives last, quietest, and never at dusk. */
    if (vis > 0.55) {
      for (const c of this.saved) {
        if (!c.name) continue;

        const pts = c.pts.map((i) => this.stars[i]).filter(Boolean);
        if (!pts.length) continue;

        /* Centred under the LOWEST star, not under the centroid: a name that
           lands inside its own constellation is a name with a line through it.

           Then held inside the open sky. The star field runs down to 0.6·H,
           which is well past the treeline, so a constellation can easily have
           its feet in the forest — and the forest draws after us, over the top
           of anything we put there. */
        const mid = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const low = pts.reduce((s, p) => Math.max(s, p.y), 0);
        const ty = clamp(low + 7, 1, this.canopy - 5);

        g.globalAlpha = 0.45 * vis;
        pxText(g, mid + ox - textWidth(c.name) / 2, ty + oy, c.name, col);
        g.globalAlpha = 1;
      }
    }

    // The one you're drawing now, brighter, and it breathes.
    if (this.drawing.length) {
      const pulse = 0.55 + Math.sin(t * 3) * 0.2;
      line(this.drawing, pulse * vis, col);

      // Ring the stars you've claimed so far.
      for (const i of this.drawing) {
        const s = this.stars[i];
        if (!s) continue;
        glow.globalAlpha = pulse * vis;
        glowDot(glow, s.x + ox, s.y + oy, 3, col, 0.9);
        glow.globalAlpha = 1;
      }
    }
  }

  _drawShootingStar(g, glow, s, vis, pal) {
    const len = 16;
    const nx = -s.vx;
    const ny = -s.vy;
    const m = Math.hypot(nx, ny) || 1;

    for (let i = 0; i < len; i++) {
      const f = i / len;
      const a = (1 - f) * vis * clamp(s.life, 0, 1);
      if (a < 0.02) continue;
      const x = s.x + (nx / m) * i * 2.2;
      const y = s.y + (ny / m) * i * 2.2;

      g.globalAlpha = a;
      dot(g, x, y, rgbCss([255, 255, 255]), f < 0.3 ? 2 : 1);
      g.globalAlpha = 1;
    }

    glow.globalAlpha = clamp(s.life, 0, 1) * vis;
    glowDot(glow, s.x, s.y, 5, rgbCss(pal.glow), 0.9);
    glow.globalAlpha = 1;
  }
}
