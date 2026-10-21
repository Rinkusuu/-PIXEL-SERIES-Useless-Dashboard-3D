/* ============================================================================
   CrittersLayer — everything alive: fireflies, butterflies, birds, falling
   leaves, drifting pollen.

   One layer, one POOL, one loop. Every critter is a slot in a pre-allocated
   array with a `kind` tag; nothing is ever constructed or garbage-collected at
   runtime. A particle system that allocates is a particle system that stutters
   every few seconds when the GC runs, and that stutter is the single most
   common reason a beautiful canvas scene feels cheap.

   Populations respond to the time of day, because that's what makes the world
   feel like it has rules:
     · fireflies   — night only, and only when it isn't raining
     · butterflies — day only, fair weather
     · birds       — dawn and dusk, in skeins
     · leaves      — always, more when windy
     · pollen      — day, drifting up through shafts of light
   ========================================================================== */

import { Layer } from '../Layer.js';
import { horizon } from '../horizon.js';
import { px, dot, glowDot } from '../../ui/pixel.js';
import { bus } from '../../core/bus.js';
import { play } from '../../core/play.js';
import { catchLeaf } from '../../core/leaves.js';
import { rgbCss, rng, clamp, lerp, remap, TAU, fbm1 } from '../../core/util.js';

const KIND = { DEAD: 0, FIREFLY: 1, BUTTERFLY: 2, BIRD: 3, LEAF: 4, POLLEN: 5, PETAL: 6 };
const POOL = 300;

const LEAF_COLORS = ['#d98a4a', '#c46a3a', '#e0a95c', '#8f5a34'];
const WING_COLORS = ['#ffd479', '#ff8fa3', '#8fe0ff', '#c89bff'];
const PETAL_COLORS = ['#ffd7e4', '#ffc0d4', '#ffe8f0', '#f7b8cf'];

/** How far the cursor's wake reaches, in scene pixels. */
const PUSH_RADIUS = 34;

export class CrittersLayer extends Layer {
  constructor() {
    super({ depth: 0.85, name: 'critters' });
    this.pool = [];
    this._r = rng(5150);

    /* CATCHING LEAVES.

       Implemented here, and not in a layer of its own, because the leaves are
       here. A CatchingLayer would have needed its own copy of every leaf's
       position — a second, parallel truth about where the leaves are, updated
       from the first one every frame and wrong the moment it wasn't. The layer
       that owns the thing owns what you can do to the thing. */
    bus.on('scene:click', (p) => {
      if (play.mode !== 'leaves') return;
      this._catch(p);
    });
  }

  /** Grab the nearest falling leaf, if your aim was anywhere near it. */
  _catch({ x, y }) {
    const REACH = 14; // generous. This is meant to be nice, not a test.

    let best = null;
    let bestD = REACH;

    for (const p of this.pool) {
      if (p.kind !== KIND.LEAF && p.kind !== KIND.PETAL) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = p; }
    }

    if (!best) {
      bus.emit('sfx', 'hover');
      return;
    }

    // Caught. It goes out of the world and into a number, which is the saddest
    // sentence in this file and also the entire point of a score.
    best.kind = KIND.DEAD;
    catchLeaf();
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this.groundTop = horizon(H).critterTop;

    if (this.pool.length === 0) {
      this.pool = Array.from({ length: POOL }, () => ({
        kind: KIND.DEAD,
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, max: 1,
        phase: 0, size: 1, color: '#fff',
        seed: 0, flap: 0, depth: 0.5,
      }));
    }
  }

  /** Grab a dead slot. Returns null when the pool is full — which is the point:
      the pool IS the particle budget, and it can never be exceeded. */
  _alloc() {
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].kind === KIND.DEAD) return this.pool[i];
    }
    return null;
  }

  /**
   * How many of each kind the world wants right now.
   *
   * This is where the SEASON becomes visible. Nothing else in this layer knows
   * what month it is — the behaviours are identical all year. What changes is
   * simply who is out: butterflies in spring, fireflies on summer nights, a
   * blizzard of dead leaves in October, and a winter meadow where nothing flies
   * at all. Population is the cheapest storytelling in the whole project.
   */
  _targets(env) {
    const { pal, wind, quality, motion, season } = env;
    const clear = pal.weather === 'clear' || pal.weather === 'cloudy';
    const night = pal.lum < 0.3;
    const day = pal.lum > 0.55;
    // Dawn/dusk: the band where the sun is near the horizon.
    const twilight = pal.lum > 0.15 && pal.lum < 0.6;

    const q = quality;
    const s = season;
    const fireflies = night && pal.weather !== 'rain' && pal.weather !== 'storm';

    /* Reduced motion: everything that TRAVELS across the frame is retired —
       birds, butterflies, leaves, pollen, petals. Fireflies stay, at half
       strength. They're the soul of the night scene, they drift a couple of
       pixels, and what you actually perceive is their PULSE, which is a change
       in opacity rather than motion. Keeping them is the difference between a
       considerate accommodation and a punishment. */
    if (!motion) {
      return {
        [KIND.FIREFLY]: fireflies ? Math.round(26 * q * s.fireflies) : 0,
        [KIND.BUTTERFLY]: 0,
        [KIND.BIRD]: 0,
        [KIND.LEAF]: 0,
        [KIND.POLLEN]: 0,
        [KIND.PETAL]: 0,
      };
    }

    return {
      [KIND.FIREFLY]: fireflies ? Math.round(52 * q * s.fireflies) : 0,
      [KIND.BUTTERFLY]: day && clear ? Math.round(12 * q * s.butterflies) : 0,
      [KIND.BIRD]: twilight && clear ? Math.round(9 * q) : 0,
      [KIND.LEAF]: Math.round((6 + wind * 16) * q * s.leafFall),
      [KIND.POLLEN]: day && clear ? Math.round(30 * q * s.pollen) : 0,
      // Cherry blossom. Spring only, and it is the single prettiest thing the
      // particle system does all year.
      [KIND.PETAL]: Math.round(34 * q * s.petals),
    };
  }

  update(env) {
    const { dt, t, wind, pal } = env;
    const r = this._r;

    // Census, then top up / cull toward the targets. Culling is soft: we let a
    // critter finish its life rather than vanishing it, so populations ebb.
    const want = this._targets(env);
    const have = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const p of this.pool) if (p.kind) have[p.kind]++;

    for (const k of [KIND.FIREFLY, KIND.BUTTERFLY, KIND.BIRD, KIND.LEAF, KIND.POLLEN, KIND.PETAL]) {
      // Spawn at most a couple per frame — a population that pops into
      // existence all at once is a population you notice being born.
      if (have[k] < want[k] && r() < 0.35) this._spawn(k, r);
    }

    for (const p of this.pool) {
      if (!p.kind) continue;
      p.life += dt;

      // Over-population: retire the oldest gently by cutting their lifespan.
      if (have[p.kind] > want[p.kind] * 1.25) p.life += dt * 3;

      switch (p.kind) {
        case KIND.FIREFLY: this._stepFirefly(p, dt, t, wind, env.motion); break;
        case KIND.BUTTERFLY: this._stepButterfly(p, dt, t, wind); break;
        case KIND.BIRD: this._stepBird(p, dt, t); break;
        case KIND.LEAF: this._stepLeaf(p, dt, t, wind); break;
        case KIND.POLLEN: this._stepPollen(p, dt, t, wind); break;
        case KIND.PETAL: this._stepPetal(p, dt, t, wind); break;
      }

      // Birds are too big and too far away to be shoved by a cursor. Everything
      // else is fair game.
      if (env.motion && env.pointer.active && p.kind !== KIND.BIRD) {
        this._disturb(p, dt, env.pointer);
      }

      if (p.life > p.max) p.kind = KIND.DEAD;
      // Anything that leaves the frame is recycled immediately.
      if (p.x < -60 || p.x > this.W + 60 || p.y > this.H + 30 || p.y < -50) {
        p.kind = KIND.DEAD;
      }
    }
  }

  _spawn(kind, r) {
    const p = this._alloc();
    if (!p) return;

    p.kind = kind;
    p.life = 0;
    p.phase = r() * TAU;
    p.seed = r() * 1000;
    p.flap = 0;
    p.depth = 0.4 + r() * 0.8;

    switch (kind) {
      case KIND.FIREFLY:
        p.x = r() * this.W;
        p.y = lerp(this.groundTop - 30, this.H - 6, r());
        p.vx = (r() - 0.5) * 6;
        p.vy = (r() - 0.5) * 4;
        p.max = 8 + r() * 14;
        p.size = r() > 0.85 ? 2 : 1;
        p.color = r() > 0.25 ? '#c8ff8a' : '#ffe28a';
        break;

      case KIND.BUTTERFLY:
        p.x = r() > 0.5 ? -12 : this.W + 12;
        p.y = lerp(this.groundTop - 20, this.H - 20, r());
        p.vx = (p.x < 0 ? 1 : -1) * (10 + r() * 14);
        p.vy = 0;
        p.max = 22 + r() * 14;
        p.size = 1;
        p.color = WING_COLORS[Math.floor(r() * WING_COLORS.length)];
        break;

      case KIND.BIRD:
        // Birds arrive as a skein: one lead, the rest trailing behind and above.
        p.x = r() > 0.5 ? -20 : this.W + 20;
        p.y = lerp(this.H * 0.08, this.H * 0.34, r());
        p.vx = (p.x < 0 ? 1 : -1) * (26 + r() * 16);
        p.vy = (r() - 0.5) * 3;
        p.max = 30;
        p.size = 1;
        p.color = '#20263f';
        break;

      case KIND.LEAF:
        p.x = r() * (this.W + 60) - 30;
        p.y = -10 - r() * 40;
        p.vx = 6 + r() * 10;
        p.vy = 10 + r() * 14;
        p.max = 30;
        p.size = r() > 0.6 ? 2 : 1;
        p.color = LEAF_COLORS[Math.floor(r() * LEAF_COLORS.length)];
        break;

      case KIND.POLLEN:
        p.x = r() * this.W;
        p.y = this.H - r() * (this.H * 0.3);
        p.vx = (r() - 0.5) * 3;
        p.vy = -(2 + r() * 5); // pollen rises
        p.max = 12 + r() * 10;
        p.size = 1;
        p.color = '#fff6d0';
        break;

      case KIND.PETAL:
        // Blossom falls from ABOVE the treeline, drifts a long way, and takes
        // its time. It's slower and lighter than a dead leaf — that difference
        // in fall speed is what makes one read as spring and the other as autumn.
        p.x = r() * (this.W + 80) - 40;
        p.y = -8 - r() * 50;
        p.vx = 4 + r() * 8;
        p.vy = 5 + r() * 8;
        p.max = 40;
        p.size = r() > 0.7 ? 2 : 1;
        p.color = PETAL_COLORS[Math.floor(r() * PETAL_COLORS.length)];
        break;
    }
  }

  /**
   * The cursor's wake. Anything light enough to be shifted by a passing hand
   * gets pushed out of the way, then drifts back.
   *
   * Two things make this feel like a hand rather than a force field:
   *   · the push is scaled by how fast the pointer is MOVING. A parked cursor
   *     exerts nothing. Sweep it quickly and things scatter.
   *   · the falloff is squared, so there's no visible circular boundary — with a
   *     linear falloff you can see the edge of the disc, and the illusion dies.
   */
  _disturb(p, dt, pointer) {
    const dx = p.x - pointer.x;
    const dy = p.y - pointer.y;
    const d = Math.hypot(dx, dy);
    if (d > PUSH_RADIUS || d < 0.001) return;

    const speed = Math.min(1, Math.hypot(pointer.vx, pointer.vy) / 6);
    const force = (1 - d / PUSH_RADIUS) ** 2 * (0.25 + speed) * 220;

    p.vx += (dx / d) * force * dt;
    p.vy += (dy / d) * force * dt;
  }

  // ── Behaviours ────────────────────────────────────────────────────────────

  /**
   * Fireflies wander on a slow noise field and pulse. The pulse is NOT a plain
   * sine — real fireflies hold dark, then flare. `pow(sin, 3)` gives exactly
   * that asymmetry, and it's the difference between "blinking dot" and "insect".
   */
  _stepFirefly(p, dt, t, wind, motion = 1) {
    const n1 = fbm1(p.seed + t * 0.35, 2, 1) - 0.5;
    const n2 = fbm1(p.seed + 400 + t * 0.3, 2, 2) - 0.5;
    p.vx += n1 * 28 * dt;
    p.vy += n2 * 22 * dt;
    p.vx = clamp(p.vx * 0.985 + wind * 0.4 * dt, -14, 14);
    p.vy = clamp(p.vy * 0.985, -10, 10);
    // Under reduced motion they hold station and simply breathe.
    p.x += p.vx * dt * motion;
    p.y += p.vy * dt * motion;

    // Keep them over the meadow — a firefly in the sky is a star with a bug.
    if (p.y < this.groundTop - 34) p.vy += 16 * dt;
    if (p.y > this.H - 4) p.vy -= 16 * dt;
  }

  _stepButterfly(p, dt, t, wind) {
    // Butterflies don't fly, they *bounce*: a big vertical sine plus a smaller
    // flutter, and forward speed that pulses with the wingbeat.
    const beat = Math.sin(t * 9 + p.phase);
    p.flap = beat;
    p.x += (p.vx + wind * 6) * dt * (0.75 + 0.35 * Math.abs(beat));
    p.y += Math.sin(t * 2.4 + p.phase) * 14 * dt + Math.sin(t * 11 + p.phase) * 4 * dt;
  }

  _stepBird(p, dt, t) {
    p.flap = Math.sin(t * 7 + p.phase);
    p.x += p.vx * dt;
    p.y += p.vy * dt + Math.sin(t * 0.8 + p.phase) * 3 * dt;
  }

  _stepLeaf(p, dt, t, wind) {
    // A falling leaf sways side to side as it stalls and slips. The horizontal
    // sine is what makes it a leaf and not a rock.
    p.x += (p.vx + wind * 22) * dt + Math.sin(t * 1.6 + p.phase) * 12 * dt;
    p.y += p.vy * dt;
    p.phase += dt * 2.4; // also its rotation
  }

  _stepPollen(p, dt, t, wind) {
    p.x += (p.vx + wind * 8) * dt + Math.sin(t * 0.7 + p.phase) * 6 * dt;
    p.y += p.vy * dt;
  }

  /**
   * A petal doesn't fall, it TUMBLES — it catches air, stalls, slips sideways,
   * catches again. The horizontal sine is much wider and slower than a leaf's,
   * and the fall speed itself oscillates. That's the whole difference between
   * blossom and confetti.
   */
  _stepPetal(p, dt, t, wind) {
    const stall = 0.6 + 0.4 * Math.sin(t * 1.1 + p.phase);
    p.x += (p.vx + wind * 16) * dt + Math.sin(t * 0.9 + p.phase) * 20 * dt;
    p.y += p.vy * stall * dt;
    p.phase += dt * 1.7;
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  draw(g, env) {
    const { pal, t, glow } = env;
    const ox = this.ox(env);
    const oy = this.oy(env);

    for (const p of this.pool) {
      if (!p.kind) continue;

      // Everything fades in and out at the ends of its life. Nothing in this
      // world is allowed to pop.
      const f = p.life / p.max;
      const fade = clamp(Math.min(f * 6, (1 - f) * 6), 0, 1);

      const x = p.x + ox * p.depth;
      const y = p.y + oy * p.depth;

      switch (p.kind) {
        case KIND.FIREFLY: this._drawFirefly(g, glow, p, x, y, fade, t, env); break;
        case KIND.BUTTERFLY: this._drawButterfly(g, p, x, y, fade, pal); break;
        case KIND.BIRD: this._drawBird(g, p, x, y, fade, pal); break;
        case KIND.LEAF: this._drawLeaf(g, p, x, y, fade, pal); break;
        case KIND.POLLEN: this._drawPollen(g, glow, p, x, y, fade, t, pal); break;
        case KIND.PETAL: this._drawPetal(g, p, x, y, fade, pal); break;
      }
    }
  }

  /**
   * Fireflies are where the music and the breath surface in the world.
   *
   * `bass` widens their halo and lifts their floor, so a heavy track makes the
   * meadow throb; `breath` (in Zen mode) makes them all swell together as you
   * inhale. Both ride ON TOP of each firefly's own pulse rather than replacing
   * it — so they never march in lockstep, they just get brighter together. A
   * particle system that snaps into perfect sync with a beat looks like a
   * screensaver; one that merely leans into it looks alive.
   */
  _drawFirefly(g, glow, p, x, y, fade, t, env) {
    const s = Math.sin(t * 1.9 + p.phase);
    const pulse = Math.pow(clamp(s, 0, 1), 3); // dark, dark, dark, FLARE

    const lift = env.bass * 0.5 + (env.zen ? (env.breath - 0.5) * 0.5 : 0);
    const a = fade * clamp(0.14 + pulse * 0.86 + lift * 0.35, 0, 1);
    if (a < 0.03) return;

    g.globalAlpha = a;
    dot(g, x, y, p.color, p.size);
    g.globalAlpha = 1;

    glow.globalAlpha = a * 0.95;
    glowDot(glow, x, y, 3 + pulse * 5 + lift * 6, p.color, 1);
    glow.globalAlpha = 1;
  }

  _drawPetal(g, p, x, y, fade, pal) {
    const col = rgbCss(pal.lit(p.color, 1.18));
    // Same trick as the leaf: it turns its face to you, then its edge. But a
    // petal is wider than it is tall, so the aspect flips as it tumbles.
    const spin = Math.abs(Math.cos(p.phase));
    const w = Math.max(1, Math.round(p.size * (0.4 + spin * 1.6)));
    const h = Math.max(1, Math.round(p.size * (1.4 - spin * 0.6)));
    g.globalAlpha = fade * 0.95;
    px(g, x, y, w, h, col);
    g.globalAlpha = 1;
  }

  _drawButterfly(g, p, x, y, fade, pal) {
    const col = rgbCss(pal.lit(p.color, 1.2));
    const dark = rgbCss(pal.lit(p.color, 0.7));
    // Wings foreshorten on the beat: 2px wide at the top of the stroke, 4 at
    // the bottom. Two frames of animation is all a pixel butterfly needs.
    const open = Math.abs(p.flap);
    const w = Math.round(1 + open * 2);

    g.globalAlpha = fade;
    px(g, x - w, y - 1, w, 2, col);
    px(g, x + 1, y - 1, w, 2, col);
    px(g, x, y, 1, 1, dark); // body
    g.globalAlpha = 1;
  }

  _drawBird(g, p, x, y, fade, pal) {
    // The classic pixel bird: a "v" whose arms rise and fall. Three states.
    const col = rgbCss(pal.lit(p.color, 0.9));
    const up = p.flap > 0.35 ? -1 : p.flap < -0.35 ? 1 : 0;
    const dir = Math.sign(p.vx);

    g.globalAlpha = fade * 0.9;
    g.fillStyle = col;
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
    g.fillRect(Math.round(x - 2 * dir), Math.round(y + up), 2, 1);
    g.fillRect(Math.round(x + 1 * dir), Math.round(y + up), 2, 1);
    g.globalAlpha = 1;
  }

  _drawLeaf(g, p, x, y, fade, pal) {
    const col = rgbCss(pal.lit(p.color, 1.05));
    // "Rotation": the leaf presents its face, then its edge, then its face.
    const spin = Math.abs(Math.cos(p.phase));
    const w = Math.max(1, Math.round(p.size * (0.3 + spin * 1.4)));
    g.globalAlpha = fade * 0.9;
    px(g, x, y, w, p.size, col);
    g.globalAlpha = 1;
  }

  _drawPollen(g, glow, p, x, y, fade, t, pal) {
    const a = fade * (0.25 + 0.35 * Math.sin(t * 2 + p.phase)) * pal.lum;
    if (a < 0.03) return;
    g.globalAlpha = a;
    dot(g, x, y, p.color, 1);
    g.globalAlpha = 1;

    glow.globalAlpha = a * 0.5;
    dot(glow, x, y, p.color, 1);
    glow.globalAlpha = 1;
  }
}
