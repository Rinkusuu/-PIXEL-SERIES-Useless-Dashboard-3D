/* ============================================================================
   StonesLayer — skipping stones across the lake.

   The stone is a real projectile: it is thrown with a velocity, gravity pulls it
   down, and when it touches the water it either skips or it sinks. Nothing here
   is a scripted animation with a "number of skips" decided in advance.

   WHETHER IT SKIPS IS THE ANGLE OF ATTACK — which is exactly what it is in life.
   A stone coming down steeply digs in and sinks. A stone coming in shallow
   glances off. So the game is: throw FLAT and throw FAR, and the way you do that
   is aim at the far side of the lake rather than at the middle of it. Nobody has
   to be told this, because everyone has already thrown a stone at a lake.

   Each skip bleeds energy, and each skip is shorter than the last, which is why
   a good throw ends in that little flurry of rapid touches before it goes under.
   That flurry is free — it falls out of the physics. We didn't write it.
   ========================================================================== */

import { Layer } from '../Layer.js';
import { horizon } from '../horizon.js';
import { px } from '../../ui/pixel.js';
import { bus } from '../../core/bus.js';
import { play } from '../../core/play.js';
import { contact, finishThrow, stoneCharacter } from '../../core/stones.js';
import { rgbCss, clamp, lerp } from '../../core/util.js';

const G = 62; // gravity, scene-pixels/s². Tuned by eye, like everything here.

// Whether it skips (the angle of attack) and what a throw earns live in core/stones.js.

export class StonesLayer extends Layer {
  constructor() {
    super({ depth: 0.44, name: 'stones' });
    this.stone = null;

    bus.on('play', ({ mode }) => {
      if (mode !== 'skip') this.stone = null;
    });

    bus.on('scene:click', (p) => {
      if (play.mode !== 'skip') return;
      this._throw(p);
    });
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    const hz = horizon(H);
    this.near = hz.waterBot - 1; // the water at your feet
    this.far = hz.waterTop; // the far bank
    this.hand = { x: W * 0.14, y: hz.waterBot - 2 };
  }

  /**
   * THE STONE HAS A THIRD AXIS.
   *
   * This is the thing I got wrong first, and it's worth writing down. The lake is
   * drawn as a horizontal band, so screen-y across that band is DISTANCE ACROSS
   * THE WATER, not height. Treating screen-y as height meant "up" and "away" were
   * the same axis — so gravity pulled the stone back toward the near shore, the
   * arc it flew was the arc it drew, and it could never actually be *above* the
   * lake. It touched down once, at the point you aimed at, and that was that.
   *
   * So the stone lives on the water PLANE (x, y) and carries a separate height
   * `h` above it. Gravity acts on h alone. A skip is h reaching zero with enough
   * forward speed and a shallow enough descent. It's drawn at `y - h`, which is
   * the one line that turns three numbers back into a picture.
   *
   * Everything good falls out of this for free: the shadow tracking along the
   * water underneath it, the hops getting shorter and closer together, and the
   * final flurry of touches before it goes under.
   */
  _throw({ x, y }) {
    if (this.stone) return; // one at a time. It's not a machine gun.

    const from = this.hand;

    const dx = x - from.x;
    const dy = y - from.y; // negative = further out across the lake
    const dist = Math.hypot(dx, dy) || 1;

    // How committed the throw is. Aim across the lake and you throw HARD.
    const reach = Math.hypot(this.W, this.near - this.far);
    const power = clamp(dist / (reach * 0.62), 0.12, 1);

    const speed = lerp(55, 205, power);

    /* And here is the whole game, in one line: a hard throw is a FLAT throw.
       Lob it gently at the water by your feet and it comes down steep and plunks.
       Fire it low and fast across the lake and it kisses the surface and runs.
       Nobody needs to be told this. Everyone has thrown a stone at a lake. */
    const lift = lerp(46, 13, power);

    /* Every stone is a different stone. Restitution and drag are rolled per
       throw, so a perfect line doesn't always give you the same number — which
       is the difference between a game and a formula. You reached for a flat one
       and you got what you got. */
    this.stone = {
      x: from.x,
      y: from.y,
      h: 2, // it leaves your hand just above the water
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      vh: lift,
      ...stoneCharacter(),
      skips: 0,
      spin: 0,
    };

    bus.emit('sfx', 'click');
  }

  update(env) {
    const s = this.stone;
    if (!s) return;

    const { dt } = env;

    s.vh -= G * dt;
    s.h += s.vh * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.spin += dt * 22;

    // Off the side, or clean over the far bank: it's out of the lake.
    if (s.x < -8 || s.x > this.W + 8 || s.y < this.far - 2) return this._done();

    if (s.h > 0) return;

    // ── Contact ──────────────────────────────────────────────────────────────
    s.h = 0;

    const forward = Math.hypot(s.vx, s.vy); // speed along the water
    const ring = { x: s.x, y: s.y, strength: clamp(forward / 90, 0.3, 1) };
    bus.emit('water:ring', ring);

    // Too steep to plane, or too slow to stay up: it digs in and sinks.
    if (contact(s, 30) === 'sink') {
      bus.emit('splash', clamp(forward / 110, 0.2, 0.8));
      return this._done();
    }
    s.h = 0.1;
  }

  _done() {
    const n = this.stone?.skips ?? 0;
    this.stone = null;
    finishThrow(n);
  }

  draw(g, env) {
    const s = this.stone;
    if (!s) return;

    const { pal } = env;
    const col = rgbCss(pal.lit('#8a8f9c', 0.95));
    const shade = rgbCss(pal.lit('#0d1b2c', 0.9));

    /* The shadow sits on the water at (x, y) while the stone is drawn at
       (x, y - h). That gap between them IS the height — it's the only cue the
       viewer gets that the stone is above the lake rather than sliding along it,
       and it costs one pixel. */
    if (s.h > 0.5) {
      g.globalAlpha = clamp(0.3 - s.h * 0.012, 0.05, 0.3);
      px(g, s.x, s.y, 2, 1, shade);
      g.globalAlpha = 1;
    }

    // A stone in flight is 2×1, and it tumbles — the pixel it "loses" as it
    // rotates is the whole reason it reads as spinning rather than sliding.
    const flat = Math.abs(Math.sin(s.spin)) > 0.5;
    px(g, s.x, s.y - s.h, flat ? 2 : 1, flat ? 1 : 2, col);
  }
}
