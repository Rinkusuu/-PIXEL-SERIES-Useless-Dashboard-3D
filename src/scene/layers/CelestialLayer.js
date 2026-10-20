/* ============================================================================
   CelestialLayer — the sun and the moon, on a real arc, with a real moon phase.

   Both bodies travel a semicircle from their rise point to their set point,
   using the actual sunrise/sunset the weather API reports for the user's
   latitude (falling back to 6:00/19:30). The moon does the same, inverted, and
   is shaded with the correct phase for today's date — a detail almost nobody
   will consciously notice and everybody will feel.
   ========================================================================== */

import { Layer } from '../Layer.js';
import { pxCircle, glowDot } from '../pixel.js';
import { horizon } from '../horizon.js';
import { maxSolarAltitude } from '../season.js';
import { rgbCss, clamp, lerp, TAU, remap } from '../../core/util.js';

/** Days since a known new moon (2000-01-06). Good to a few hours for centuries. */
const SYNODIC = 29.530588853;
function moonPhase(date = new Date()) {
  const known = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - known) / 86400000;
  return ((days % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC; // 0 = new, 0.5 = full
}

export class CelestialLayer extends Layer {
  constructor() {
    super({ depth: 0.1, name: 'celestial' });
    this.phase = moonPhase();
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
  }

  /**
   * Where a body sits, given the hour it rises and the hour it sets.
   *
   * `climb` (0–1) scales the height of the arc. It comes from the REAL maximum
   * solar altitude for this latitude on this date, and it is the single detail
   * that makes the seasons physical rather than decorative:
   *
   *   · At 52°N in June the sun climbs to ~61° — a tall arc, high overhead.
   *   · At 52°N in December it reaches ~14° — it crawls along the horizon all
   *     day and never really gets up, which is exactly what a northern winter
   *     feels like and exactly what the sky does.
   *
   * The day LENGTH is already correct (sunrise/sunset come from the weather
   * API). This adds the missing dimension: the day's HEIGHT.
   */
  _arc(hour, rise, set, climb = 1) {
    let h = hour;
    let s = set;
    // The moon's span wraps midnight (rises 19:30, sets 06:00 the next day).
    if (s < rise) {
      s += 24;
      if (h < rise) h += 24;
    }
    const f = (h - rise) / (s - rise);
    if (f < -0.06 || f > 1.06) return null; // below the horizon

    // A little margin outside [0,1] so the body visibly rises out of, and sinks
    // into, the land rather than popping into existence.
    const x = this.W * lerp(0.1, 0.9, f);
    const alt = Math.sin(clamp(f, 0, 1) * Math.PI);
    const y = horizon(this.H).skyline - alt * (this.H * 0.42) * climb;
    return { x, y, f, alt: alt * climb };
  }

  draw(g, env) {
    const { pal, hour, sun: sunTimes, glow, t, season, lat } = env;
    const rise = sunTimes?.sunriseHour ?? 6.0;
    const set = sunTimes?.sunsetHour ?? 19.5;

    const ox = this.ox(env);
    const oy = this.oy(env);

    /* The real maximum altitude, in degrees, normalised into an arc scale.
       Mapped onto [0.34, 1] rather than [0, 1]: a mathematically-honest zero
       would bury the sun inside the mountains at high latitudes in December,
       and a sun you cannot see is not a design, it's a bug report. This keeps
       the winter sun low and grazing while still visible. */
    const maxAlt = maxSolarAltitude(lat ?? 45, season?.doy ?? 172);
    const climb = clamp(remap(maxAlt, 5, 70, 0.34, 1), 0.34, 1);

    const sun = this._arc(hour, rise, set, climb);
    // The moon runs the OPPOSITE arc — when the sun rides low in winter, the
    // full moon rides high. That's not a flourish, it's just geometry, and it's
    // free once you have the declination.
    const moon = this._arc(hour, set, rise, clamp(1.34 - climb, 0.4, 1));

    if (sun) this._sun(g, glow, sun.x + ox, sun.y + oy, sun.alt, pal, t);
    if (moon) this._moon(g, glow, moon.x + ox, moon.y + oy, moon.alt, pal, t);
  }

  _sun(g, glow, x, y, alt, pal, t) {
    // Storms hide the disc entirely; overcast leaves a bright, soft smudge.
    const veil = { clear: 1, cloudy: 0.45, fog: 0.3, rain: 0.18, snow: 0.3, storm: 0.06 }[pal.weather] ?? 1;
    if (veil < 0.08) return;

    const r = 11;
    const col = rgbCss(pal.sun);

    // Corona in the emissive buffer. Bigger and warmer when the sun is low —
    // that's the atmosphere doing the work, and it's what makes golden hour.
    const lowness = 1 - alt;
    const halo = 20 + lowness * 26;

    glow.globalAlpha = veil * (0.55 + lowness * 0.45);
    glowDot(glow, x, y, halo, rgbCss(pal.glow), 1);
    glowDot(glow, x, y, r + 3, col, 1);
    glow.globalAlpha = 1;

    if (veil > 0.35) {
      g.globalAlpha = veil;
      pxCircle(g, x, y, r, col);
      // A brighter core disc — a flat sun looks like a sticker.
      pxCircle(g, x - 1, y - 1, r - 4, rgbCss([255, 255, 255]));
      g.globalAlpha = 1;
    }

    // God rays: four slow-rotating spokes, emissive only. Subtle enough that
    // you read them as glare rather than as geometry.
    if (veil > 0.6) {
      glow.save();
      glow.globalAlpha = 0.16 * veil;
      glow.translate(Math.round(x), Math.round(y));
      glow.rotate(t * 0.05);
      glow.fillStyle = rgbCss(pal.glow);
      for (let i = 0; i < 4; i++) {
        glow.rotate(Math.PI / 2);
        glow.fillRect(-2, -halo * 1.8, 4, halo * 3.6);
      }
      glow.restore();
      glow.globalAlpha = 1;
    }
  }

  _moon(g, glow, x, y, alt, pal, t) {
    const veil = { clear: 1, cloudy: 0.5, fog: 0.28, rain: 0.2, snow: 0.35, storm: 0.08 }[pal.weather] ?? 1;
    if (veil < 0.08) return;

    const r = 9;
    const bright = rgbCss([242, 244, 255]);
    const shadow = rgbCss(pal.sky[0]);

    glow.globalAlpha = veil * (0.5 + (1 - alt) * 0.3);
    glowDot(glow, x, y, 18 + (1 - alt) * 10, rgbCss(pal.glow), 1);
    glow.globalAlpha = 1;

    g.globalAlpha = veil;
    pxCircle(g, x, y, r, bright);

    // Craters — three fixed dents. They also give the disc a scale reference,
    // without which a pale circle just reads as "a hole".
    g.fillStyle = rgbCss([214, 218, 240]);
    g.fillRect(Math.round(x - 4), Math.round(y - 3), 3, 2);
    g.fillRect(Math.round(x + 1), Math.round(y + 2), 4, 3);
    g.fillRect(Math.round(x - 1), Math.round(y + 5), 2, 2);

    // The phase: occlude the disc with a shadow disc slid across it.
    //   offset 0        → shadow sits dead centre → new moon (fully dark)
    //   offset ≥ 2.1·r  → shadow slid clear off   → full moon (fully lit)
    // `open` is 0 at new and 1 at full; the sign decides which limb is lit, so
    // a waxing moon is lit on the right and a waning moon on the left.
    const p = this.phase;
    const open = (1 - Math.cos(p * TAU)) / 2;
    const dir = p < 0.5 ? -1 : 1;

    if (open < 0.97) {
      g.save();
      g.beginPath();
      g.arc(Math.round(x), Math.round(y), r + 0.5, 0, TAU);
      g.clip();
      pxCircle(g, x + dir * open * r * 2.1, y, r + 1, shadow);
      g.restore();
    }
    g.globalAlpha = 1;
  }
}
