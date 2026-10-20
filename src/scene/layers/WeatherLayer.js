/* ============================================================================
   WeatherLayer — rain, snow, lightning, and the ripple rings rain leaves on
   the lake.

   Weather never snaps on. `intensity` chases its target over ~3 seconds, so a
   storm rolls in and clears out. A hard cut between weather states is the most
   obvious tell that you're looking at a state machine rather than at a sky.

   Rain is drawn in three depth bands: far rain is short, faint and near-
   vertical; near rain is long, bright and slanted. That's the same atmospheric
   trick the mountains use, applied to falling water.
   ========================================================================== */

import { Layer } from '../Layer.js';
import { horizon } from '../horizon.js';
import { px } from '../pixel.js';
import { bus } from '../../core/bus.js';
import { audio } from '../../core/audio.js';
import { rgbCss, rng, clamp, lerp, damp, TAU } from '../../core/util.js';

const MAX_DROPS = 340;
const MAX_FLAKES = 260;

export class WeatherLayer extends Layer {
  constructor() {
    super({ depth: 1, name: 'weather' });

    this.intensity = 0; // 0–1, eased
    this.kind = 'clear';

    this.drops = [];
    this.flakes = [];
    this.splashes = [];

    // Lightning is a little state machine: dark → flash → afterglow → dark.
    this.flash = 0;
    this._nextBolt = 4 + Math.random() * 8;
    this._bolt = null;
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    const r = rng(8899);

    this.drops = Array.from({ length: MAX_DROPS }, () => this._newDrop(r, true));
    this.flakes = Array.from({ length: MAX_FLAKES }, () => this._newFlake(r, true));
    this.splashes = [];
  }

  _newDrop(r, seed = false) {
    const band = r(); // 0 far → 1 near
    return {
      x: r() * (this.W + 80) - 40,
      y: seed ? r() * this.H : -r() * 40,
      band,
      len: 3 + band * 9,
      speed: 220 + band * 320,
      alpha: 0.18 + band * 0.42,
    };
  }

  _newFlake(r, seed = false) {
    const band = r();
    return {
      x: r() * this.W,
      y: seed ? r() * this.H : -r() * 30,
      band,
      size: band > 0.72 ? 2 : 1,
      speed: 16 + band * 34,
      phase: r() * TAU,
      wob: 6 + r() * 16,
      alpha: 0.35 + band * 0.55,
    };
  }

  update(env) {
    const { dt, pal, wind, t, motion, precip } = env;
    this.kind = pal.weather;

    /* Reduced motion suppresses the PARTICLES and the flash, not the weather.
       The palette still grades the world storm-blue, the fog still thickens and
       the ambient rain still plays — you can see and hear that it's raining,
       there just isn't a screenful of streaks falling past your eyes.

       The lightning is disabled outright here, and that's the least negotiable
       line in this file: a full-viewport white flash is a photosensitivity
       trigger, and someone who has asked for less motion has told us enough. */
    let target = motion
      ? ({ rain: 0.75, storm: 1, snow: 0.7, fog: 0, cloudy: 0, clear: 0 }[this.kind] ?? 0)
      : 0;

    /* Scale by how hard it's ACTUALLY falling. The forecast now tells us the
       millimetres, so a drizzle gets a scattering of drops and a downpour gets
       the full curtain — rather than both getting the same 340 raindrops and
       differing only in the word printed on the panel. A storm ignores this: a
       thunderstorm is a thunderstorm. */
    if (this.kind !== 'storm' && typeof precip === 'number') {
      target *= lerp(0.3, 1, clamp(precip, 0, 1));
    }

    // 0.55/sec ≈ a 3-second roll-in. Slow enough to feel like weather.
    this.intensity = damp(this.intensity, target, 0.55, dt);

    if (!motion) {
      this.flash = 0;
      this._bolt = null;
    }

    if (this.intensity < 0.01) {
      this.splashes.length = 0;
      return;
    }

    const raining = this.kind === 'rain' || this.kind === 'storm';
    const snowing = this.kind === 'snow';
    const r = Math.random;

    if (raining) this._updateRain(dt, wind, r);
    if (snowing) this._updateSnow(dt, wind, t, r);
    if (this.kind === 'storm' && motion) this._updateLightning(dt, env);

    // Splash rings on the lake.
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.life += dt;
      s.r += dt * 22;
      if (s.life > 0.5) this.splashes.splice(i, 1);
    }
  }

  _updateRain(dt, wind, r) {
    const active = Math.round(MAX_DROPS * this.intensity);

    // Ask the shoreline where the lake is. This used to be its own private copy
    // of the water's coordinates, which meant widening the lake would have left
    // the rain making rings on the grass.
    const { waterTop: lakeTop, waterBot: lakeBot } = horizon(this.H);

    for (let i = 0; i < active; i++) {
      const d = this.drops[i];
      d.y += d.speed * dt;
      d.x += (14 + wind * 90) * (0.4 + d.band) * dt;

      // A drop that reaches the lake makes a ring; one that reaches the meadow
      // just dies. (Rings on grass would look like the grass is a puddle.)
      if (d.y > this.H + 10) {
        Object.assign(d, this._newDrop(r));
      } else if (d.y > lakeTop && d.y < lakeBot && r() < 0.06) {
        this.splashes.push({ x: d.x, y: d.y, r: 0, life: 0 });
        Object.assign(d, this._newDrop(r));
      }
    }
  }

  _updateSnow(dt, wind, t, r) {
    const active = Math.round(MAX_FLAKES * this.intensity);
    for (let i = 0; i < active; i++) {
      const f = this.flakes[i];
      f.y += f.speed * dt * (0.5 + f.band);
      // Snow doesn't fall, it *wanders* down. The sine is the whole character.
      f.x += Math.sin(t * 0.9 + f.phase) * f.wob * dt + wind * 26 * dt * (0.3 + f.band);
      if (f.y > this.H + 6) Object.assign(f, this._newFlake(r));
      if (f.x > this.W + 8) f.x = -8;
      if (f.x < -8) f.x = this.W + 8;
    }
  }

  /**
   * Lightning. The flash is a 4-stage envelope — strike, dip, re-strike, decay —
   * because a real bolt has multiple return strokes and a single fade looks
   * like someone toggling a light switch.
   */
  _updateLightning(dt, env) {
    this.flash = Math.max(0, this.flash - dt * 3.2);

    if (this._bolt) {
      this._bolt.life -= dt;
      if (this._bolt.life <= 0) this._bolt = null;
    }

    this._nextBolt -= dt;
    if (this._nextBolt > 0) return;

    this._nextBolt = 3 + Math.random() * 11;

    const distance = Math.random(); // 0 = overhead, 1 = far away
    this.flash = 1 - distance * 0.55;

    // Near strikes get a visible bolt; distant ones are just sky-flash.
    if (distance < 0.55) {
      this._bolt = { path: this._forkPath(), life: 0.14 + Math.random() * 0.1 };
    }

    audio.thunder(distance);
    if (distance < 0.3) bus.emit('lightning', { distance });
  }

  /** A jagged path from the cloud base to the horizon, with one or two forks. */
  _forkPath() {
    const x0 = this.W * (0.12 + Math.random() * 0.76);
    const y1 = this.H * 0.5;
    const pts = [{ x: x0, y: 0 }];
    let x = x0;
    let y = 0;
    while (y < y1) {
      y += 6 + Math.random() * 12;
      x += (Math.random() - 0.5) * 22;
      pts.push({ x, y });
    }

    const forks = [];
    for (let i = 2; i < pts.length - 1; i++) {
      if (Math.random() > 0.78) {
        const f = [pts[i]];
        let fx = pts[i].x;
        let fy = pts[i].y;
        const dir = Math.random() > 0.5 ? 1 : -1;
        for (let j = 0; j < 3 + Math.random() * 3; j++) {
          fx += dir * (4 + Math.random() * 12);
          fy += 5 + Math.random() * 9;
          f.push({ x: fx, y: fy });
        }
        forks.push(f);
      }
    }
    return { main: pts, forks };
  }

  draw(g, env) {
    const { pal, glow, t } = env;
    if (this.intensity < 0.01 && this.flash < 0.01) return;

    const raining = this.kind === 'rain' || this.kind === 'storm';
    const snowing = this.kind === 'snow';

    if (raining) this._drawRain(g, env);
    if (snowing) this._drawSnow(g, env);
    if (this.kind === 'storm') this._drawLightning(g, glow, env);
  }

  _drawRain(g, env) {
    const { pal } = env;
    const active = Math.round(MAX_DROPS * this.intensity * env.quality);
    const col = rgbCss(pal.lit('#bcd6f0', 1.25));

    // Rain slants with the wind. The whole field shares one slant, because
    // wind is a property of the air, not of each drop.
    const slant = (0.06 + env.wind * 0.34);

    for (let i = 0; i < active; i++) {
      const d = this.drops[i];
      g.globalAlpha = d.alpha * this.intensity;
      g.fillStyle = col;

      // Draw the streak as a short slanted line of 1px segments.
      const steps = Math.ceil(d.len / 2);
      for (let s = 0; s < steps; s++) {
        g.fillRect(
          Math.round(d.x - s * slant * 2),
          Math.round(d.y - s * 2),
          1,
          2
        );
      }
    }
    g.globalAlpha = 1;

    // Splash rings — two pixels wide, expanding, on the water.
    g.fillStyle = rgbCss(pal.lit('#dcecff', 1.2));
    for (const s of this.splashes) {
      const a = (1 - s.life / 0.5) * 0.55 * this.intensity;
      if (a < 0.03) continue;
      g.globalAlpha = a;
      const r = Math.round(s.r);
      g.fillRect(Math.round(s.x - r), Math.round(s.y), r * 2, 1);
    }
    g.globalAlpha = 1;
  }

  _drawSnow(g, env) {
    const { pal, glow } = env;
    const active = Math.round(MAX_FLAKES * this.intensity * env.quality);
    const col = rgbCss(pal.lit('#ffffff', 1.3));

    for (let i = 0; i < active; i++) {
      const f = this.flakes[i];
      g.globalAlpha = f.alpha * this.intensity;
      px(g, f.x, f.y, f.size, f.size, col);

      // The big, near flakes catch the light.
      if (f.size === 2) {
        glow.globalAlpha = f.alpha * 0.3 * this.intensity;
        px(glow, f.x, f.y, 2, 2, col);
        glow.globalAlpha = 1;
      }
    }
    g.globalAlpha = 1;
  }

  _drawLightning(g, glow, env) {
    const { pal } = env;

    // The sky-wide flash, into BOTH buffers so it blows out the bloom.
    if (this.flash > 0.01) {
      // Squared falloff: a flash decays fast, then lingers as an afterglow.
      const a = this.flash * this.flash;
      g.globalAlpha = a * 0.42;
      g.fillStyle = rgbCss([210, 224, 255]);
      g.fillRect(0, 0, this.W, this.H);
      g.globalAlpha = 1;

      glow.globalAlpha = a * 0.55;
      glow.fillStyle = rgbCss([190, 210, 255]);
      glow.fillRect(0, 0, this.W, this.H * 0.6);
      glow.globalAlpha = 1;
    }

    if (!this._bolt) return;

    const stroke = (pts, w, ctx, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = rgbCss([245, 248, 255]);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
        for (let s = 0; s <= steps; s++) {
          const f = s / steps;
          ctx.fillRect(
            Math.round(lerp(a.x, b.x, f)),
            Math.round(lerp(a.y, b.y, f)),
            w,
            1
          );
        }
      }
      ctx.globalAlpha = 1;
    };

    const life = clamp(this._bolt.life / 0.14, 0, 1);
    stroke(this._bolt.main, 2, g, life);
    for (const f of this._bolt.forks) stroke(f, 1, g, life * 0.7);

    // A fat, bright copy in the emissive buffer becomes the bolt's halo.
    stroke(this._bolt.main, 3, glow, life);
    for (const f of this._bolt.forks) stroke(f, 2, glow, life * 0.8);
  }
}
