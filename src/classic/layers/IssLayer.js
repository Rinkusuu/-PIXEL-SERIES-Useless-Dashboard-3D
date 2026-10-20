/* ============================================================================
   IssLayer — the International Space Station, in the sky, where it really is.

   When the ISS is genuinely above your horizon, a bright dot crosses the pixel
   sky at its true bearing and elevation, moving at its true angular rate. It is
   not decoration. If you walk outside at that moment and look in that direction,
   it is there.

   THE MAPPING. The scene is a side-on view, so we need to flatten a hemisphere
   of sky onto a rectangle:
     · AZIMUTH → x. The frame looks south (the direction the sun crosses), so
       east is on the left and west on the right, matching the sun's travel.
     · ELEVATION → y. 0° is the horizon, 90° is the top of the frame.

   THE POSITION IS INTERPOLATED. The API is polled every 5 seconds, but the
   station moves 7.66 km/s — at 60fps it would visibly TELEPORT every five
   seconds. So we hold two samples and ease between them, and the dot glides.
   That interpolation is the difference between "a live tracker" and "a stutter".
   ========================================================================== */

import { Layer } from '../Layer.js';
import { dot, glowDot } from '../../ui/pixel.js';
import { bus } from '../../core/bus.js';
import { rgbCss, clamp, lerp, damp, remap } from '../../core/util.js';

export class IssLayer extends Layer {
  constructor() {
    super({ depth: 0.04, name: 'iss' }); // essentially at infinity
    this.iss = null;

    // Where we're drawing it, eased. `have` gates the first frame so it doesn't
    // fly in from 0,0.
    this.az = 0;
    this.el = -90;
    this.have = false;

    this.trail = [];
    this._trailClock = 0;

    bus.on('iss', (iss) => {
      this.iss = iss;
    });
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
  }

  /** Sky angles → scene pixels. */
  _project(azimuth, elev) {
    /* The frame faces south. Azimuth 90° (due east) sits at the left edge and
       270° (due west) at the right, so the station travels the same way the sun
       does. Anything in the northern half of the sky is behind the camera; we
       fold it onto the nearest edge rather than dropping it, so a pass that
       clips the north still shows something rather than vanishing. */
    const a = ((azimuth - 90 + 360) % 360) / 180; // 0 at E, 1 at W (going S)
    const x = this.W * clamp(a, -0.05, 1.05) * 0.9 + this.W * 0.05;

    // Elevation 0 → the horizon; 90 → the top of the frame.
    const horizon = this.H * 0.52;
    const y = horizon - (clamp(elev, -6, 90) / 90) * (horizon * 0.92);

    return { x, y };
  }

  update(env) {
    const { dt } = env;
    const iss = this.iss;
    if (!iss || iss.elevation == null) return;

    // Ease toward the newest sample. 2.2/sec is slow enough to smooth the
    // 5-second polling jumps and fast enough that it never lags visibly.
    if (!this.have) {
      this.az = iss.azimuth;
      this.el = iss.elevation;
      this.have = true;
    } else {
      // Azimuth wraps at 360 — easing from 359° to 1° the naive way sends the
      // dot the long way round the entire sky.
      let target = iss.azimuth;
      if (target - this.az > 180) target -= 360;
      if (target - this.az < -180) target += 360;
      this.az = damp(this.az, target, 2.2, dt);
      this.el = damp(this.el, iss.elevation, 2.2, dt);
    }

    if (this.el < -2) {
      this.trail.length = 0;
      return;
    }

    // A short breadcrumb trail, so you can see which way it's going.
    this._trailClock -= dt;
    if (this._trailClock <= 0) {
      this._trailClock = 0.28;
      const p = this._project(this.az, this.el);
      this.trail.push({ x: p.x, y: p.y, life: 0 });
      if (this.trail.length > 14) this.trail.shift();
    }
    for (const t of this.trail) t.life += dt;
  }

  draw(g, env) {
    const { pal, glow, t } = env;
    const iss = this.iss;
    if (!iss || iss.elevation == null || !this.have) return;

    // Below the horizon: it's on the far side of the planet. Nothing to draw.
    if (this.el < -2) return;

    /* Daylight drowns it. The real ISS is roughly as bright as Venus — brilliant
       against a dark sky, and completely invisible against a blue one. Fading it
       out with the daylight isn't a stylistic choice; it's the truth, and it
       makes catching one at dusk feel earned. */
    const darkness = clamp(1 - pal.lum * 1.35, 0, 1);
    const cloudVeil = { clear: 1, cloudy: 0.35, fog: 0.1, rain: 0.08, snow: 0.15, storm: 0.04 }[pal.weather] ?? 1;

    // Rising over the horizon it brightens; it doesn't pop into existence.
    const rise = clamp(remap(this.el, -2, 8, 0, 1), 0, 1);

    const a = darkness * cloudVeil * rise * (iss.sunlit ? 1 : 0.28);
    if (a < 0.04) return;

    const p = this._project(this.az, this.el);
    const white = rgbCss([255, 250, 235]);

    // Trail — fading breadcrumbs.
    for (const b of this.trail) {
      const f = clamp(1 - b.life / 4, 0, 1);
      if (f < 0.05) continue;
      g.globalAlpha = a * f * 0.35;
      dot(g, b.x, b.y, white, 1);
      g.globalAlpha = 1;
    }

    /* The station itself. It does NOT twinkle — that's the giveaway that tells
       you it isn't a star. Stars scintillate because their light is a point
       source being churned by the atmosphere; the ISS is an extended object and
       shines with a hard, steady, slightly golden light. Getting this right is
       the whole reason anyone who has actually seen one will believe this. */
    g.globalAlpha = a;
    dot(g, p.x, p.y, white, 2);
    g.globalAlpha = 1;

    glow.globalAlpha = a * 0.95;
    glowDot(glow, p.x, p.y, 7, rgbCss([210, 230, 255]), 1);
    glow.globalAlpha = 1;
  }
}
