/* ============================================================================
   FishingLayer — a float, a line, and a very long wait.

   The whole game is: cast, and then do nothing until something happens. There is
   no skill in the casting and no upgrade tree. You get one moment of reflex when
   the float goes under, and if you miss it, you wait again.

   That is the entire thesis of this dashboard, expressed as a minigame.

   THE BITE IS A POISSON PROCESS — the same maths as the fire's crackle in
   audio.js. There is no timer counting down to a guaranteed fish; at every
   instant there is a fixed small probability of a bite, which means the wait is
   memoryless. You cannot get better at predicting it, and a long wait tells you
   nothing about how much longer you'll wait. Real fishing has exactly this
   property and it is the only reason it is relaxing rather than infuriating.
   ========================================================================== */

import { Layer } from '../Layer.js';
import { horizon } from '../horizon.js';
import { px } from '../../ui/pixel.js';
import { bus } from '../../core/bus.js';
import { play } from '../../core/play.js';
import { BITE_WINDOW, CAST_TIME, bites, landCatch, lostCatch, rollCatch } from '../../core/fishing.js';
import { rgbCss, clamp, rng, lerp, TAU } from '../../core/util.js';

// The rules (the catch table, the Poisson bite, what a catch does) live in core/fishing.js.

export class FishingLayer extends Layer {
  constructor() {
    super({ depth: 0.45, name: 'fishing' });

    this.state = 'idle'; // idle | flying | waiting | biting | landing
    this.float = { x: 0, y: 0 };
    this.from = { x: 0, y: 0 };
    this._t = 0;
    this._dip = 0;
    this.shadows = [];

    bus.on('play', ({ mode }) => {
      if (mode !== 'fish') this._reset();
    });

    bus.on('scene:click', (p) => {
      if (play.mode !== 'fish') return;
      this._click(p);
    });
  }

  resize(W, H) {
    this.W = W;
    this.H = H;

    const hz = horizon(H);
    this.top = hz.waterTop;
    this.bottom = hz.waterBot;

    // The angler stands off the bottom of the frame, just below the near bank.
    this.rod = { x: W * 0.5, y: H + 4 };

    // Fish shadows, drifting under the surface. Pure ambience — they are not the
    // fish you catch, they're the reason you believe there are any.
    const r = rng(4242);
    this.shadows = Array.from({ length: 7 }, () => ({
      x: r() * W,
      y: lerp(this.top + 6, this.bottom - 4, r()),
      len: 3 + Math.floor(r() * 5),
      speed: (0.3 + r() * 0.7) * (r() > 0.5 ? 1 : -1),
      phase: r() * TAU,
    }));
  }

  _reset() {
    this.state = 'idle';
    this._t = 0;
    this._dip = 0;
  }

  _click({ x, y }) {
    // Striking. This is the only moment in the game that rewards attention.
    if (this.state === 'biting') return this._land();

    // Reeling in early, or re-casting somewhere else.
    if (this.state === 'waiting' || this.state === 'flying') return this._reset();

    if (this.state !== 'idle') return;

    // You can only cast into water. Casting into the meadow is a category error.
    if (y < this.top + 2 || y > this.bottom - 1) {
      bus.emit('toast', { icon: '🎣', text: 'Into the water, ideally.' });
      return;
    }

    this.from = { ...this.rod };
    this.float = { x: clamp(x, 4, this.W - 4), y };
    this.state = 'flying';
    this._t = 0;
    bus.emit('sfx', 'reel');
  }

  update(env) {
    const { dt } = env;

    for (const s of this.shadows) {
      s.x += s.speed * dt * 6;
      if (s.x < -10) s.x = this.W + 10;
      if (s.x > this.W + 10) s.x = -10;
    }

    if (this.state === 'idle') return;

    this._t += dt;

    if (this.state === 'flying' && this._t >= CAST_TIME) {
      this.state = 'waiting';
      this._t = 0;
      bus.emit('splash', 0.35);
      bus.emit('water:ring', { x: this.float.x, y: this.float.y });
      return;
    }

    if (this.state === 'waiting') {
      /* THE POISSON DRAW. Probability of a bite in this frame is dt/MEAN_WAIT,
         evaluated fresh every frame — never a countdown. This is what makes the
         wait memoryless, and the memorylessness is the whole point. */
      if (bites(dt)) {
        this.state = 'biting';
        this._t = 0;
        bus.emit('fish:bite'); // the one moment the game asks anything of you
        bus.emit('sfx', 'bite');
        bus.emit('splash', 0.2);
        bus.emit('water:ring', { x: this.float.x, y: this.float.y });
      }
      return;
    }

    if (this.state === 'biting') {
      // The float bobs hard under. Miss the window and it's gone.
      this._dip = Math.abs(Math.sin(this._t * 22)) * 3;
      if (this._t > BITE_WINDOW) {
        this._reset();
        lostCatch();
      }
    }
  }

  /** You struck in time. Roll the table. */
  _land() {
    bus.emit('splash', 1);
    bus.emit('water:ring', { x: this.float.x, y: this.float.y });
    landCatch(rollCatch(this._night));
    this._reset();
  }

  draw(g, env) {
    const { pal, t, glow } = env;
    this._night = pal.night;

    const oy = this.oy(env) * 0.4;

    // Fish shadows — only where there's water to see into, and never through ice.
    if (env.season.snow < 0.5) {
      const shadow = rgbCss(pal.lit('#0d1b2c', 0.9));
      for (const s of this.shadows) {
        const y = s.y + Math.sin(t * 0.7 + s.phase) * 1.5 + oy;
        g.globalAlpha = 0.22;
        px(g, s.x, y, s.len, 1, shadow);
        px(g, s.x + (s.speed > 0 ? -1 : s.len), y - 1, 1, 1, shadow);
        g.globalAlpha = 1;
      }
    }

    if (this.state === 'idle') return;

    // The float, mid-flight or floating.
    let fx = this.float.x;
    let fy = this.float.y + oy;

    if (this.state === 'flying') {
      const f = this._t / CAST_TIME;
      fx = lerp(this.from.x, this.float.x, f);
      // A cast is a parabola. A straight line reads as a laser.
      fy = lerp(this.from.y, this.float.y, f) - Math.sin(f * Math.PI) * 34;
    } else {
      // Bobbing on the surface, and yanked under when something takes it.
      fy += Math.sin(t * 2.2) * 0.6 + this._dip;
    }

    // The line. Slack, not taut — a straight line from rod to float looks like a
    // wire. It sags, and it sags more the further out you cast.
    const line = rgbCss(pal.lit('#e8e8f0', 1.0));
    g.globalAlpha = 0.45;
    const steps = 14;
    const sag = this.state === 'flying' ? 0 : 6;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const x = lerp(this.from.x, fx, f);
      const y = lerp(this.from.y, fy, f) - Math.sin(f * Math.PI) * sag;
      g.fillStyle = line;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    g.globalAlpha = 1;

    // The float itself: red over white, the way every float has ever been.
    const red = rgbCss(pal.lit('#e5484d', 1.1));
    const white = rgbCss(pal.lit('#f4f6ff', 1.05));
    px(g, fx - 1, fy - 2, 3, 2, red);
    px(g, fx - 1, fy, 3, 1, white);

    // A bite gets a bloom, so it's visible even if you're looking elsewhere.
    if (this.state === 'biting') {
      glow.globalAlpha = 0.8;
      px(glow, fx - 2, fy - 3, 5, 5, red);
      glow.globalAlpha = 1;
    }
  }
}
