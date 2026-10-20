/* ============================================================================
   moon.js — where the moon really is, and how much of it is lit.

   The classic sky only needed the phase: it hangs the moon on a painted arc.
   The walkable world has a real horizon in every direction, so the moon has to
   rise and set where it actually does. This is Paul Schlyter's low-precision
   lunar theory with the ten largest perturbations: good to well under a degree,
   which is about the width of the moon itself, and plenty for a sky you look at
   rather than navigate by. Parallax (up to ~1°) is ignored for the same reason.
   ========================================================================== */

import { eclipticToHorizontal } from './planets.js';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const SYNODIC = 29.530588853;

const sin = (d) => Math.sin(d * RAD);
const cos = (d) => Math.cos(d * RAD);

/** 0 = new, 0.5 = full. A mean phase from a known new moon; it never drifts more than ~half a day. */
export function moonPhase(date = new Date()) {
  const known = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - known) / 86400000;
  return ((days % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
}

/** Geocentric ecliptic longitude and latitude of the moon, degrees. */
export function moonEcliptic(date) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451543.5;

  const N = 125.1228 - 0.0529538083 * d; // ascending node
  const i = 5.1454;
  const w = 318.0634 + 0.1643573223 * d; // argument of perigee
  const e = 0.0549;
  const M = 115.3654 + 13.0649929509 * d; // mean anomaly

  let E = M + DEG * e * sin(M) * (1 + e * cos(M));
  for (let k = 0; k < 6; k++) E -= (E - DEG * e * sin(E) - M) / (1 - e * cos(E));

  const xv = cos(E) - e;
  const yv = Math.sqrt(1 - e * e) * sin(E);
  const v = Math.atan2(yv, xv) * DEG;
  const r = Math.hypot(xv, yv);

  const xh = r * (cos(N) * cos(v + w) - sin(N) * sin(v + w) * cos(i));
  const yh = r * (sin(N) * cos(v + w) + cos(N) * sin(v + w) * cos(i));
  const zh = r * sin(v + w) * sin(i);

  let lon = Math.atan2(yh, xh) * DEG;
  let lat = Math.atan2(zh, Math.hypot(xh, yh)) * DEG;

  // The sun's mean anomaly and longitude drive the biggest wobbles.
  const Ms = 356.047 + 0.9856002585 * d;
  const Ls = Ms + 282.9404 + 4.70935e-5 * d;
  const Lm = N + w + M;
  const D = Lm - Ls; // mean elongation
  const F = Lm - N; // argument of latitude

  lon +=
    -1.274 * sin(M - 2 * D) + // evection
    0.658 * sin(2 * D) + // variation
    -0.186 * sin(Ms) + // yearly equation
    -0.059 * sin(2 * M - 2 * D) +
    -0.057 * sin(M - 2 * D + Ms) +
    0.053 * sin(M + 2 * D) +
    0.046 * sin(2 * D - Ms) +
    0.041 * sin(M - Ms) +
    -0.035 * sin(D) +
    -0.031 * sin(M + Ms);

  lat +=
    -0.173 * sin(F - 2 * D) +
    -0.055 * sin(M - F - 2 * D) +
    -0.046 * sin(M + F - 2 * D) +
    0.033 * sin(F + 2 * D) +
    0.017 * sin(2 * M + F);

  return { lon: ((lon % 360) + 360) % 360, lat };
}

/** The moon in this observer's sky: { alt, az, ra, dec, phase }. */
export function moonPosition(date, lat, lon) {
  const m = moonEcliptic(date);
  const x = cos(m.lat) * cos(m.lon);
  const y = cos(m.lat) * sin(m.lon);
  const z = sin(m.lat);
  return { ...eclipticToHorizontal(x, y, z, date, lat, lon), phase: moonPhase(date) };
}
