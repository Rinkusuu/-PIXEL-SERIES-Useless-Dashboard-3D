/* ============================================================================
   planets.js — where Venus, Mars, Jupiter and Saturn actually are, right now.

   The dashboard's oldest promise is that everything in it is real: your weather,
   your season, the sun at the height it truly climbs to at your latitude, the
   moon in its true phase. The sky was the one place still cheating — 190 stars
   from a seed, and nothing else out there.

   These four are the naked-eye planets: the wandering stars that every sky-
   watcher in history could see and could not explain. Now they're in the sky
   where they belong, and they got there the way they got there for Kepler — by
   arithmetic. No network, no ephemeris file, no dependency. It is about 90 lines
   of trigonometry, it runs offline in a cave, and it will still be right in 2049.

   The elements are JPL's approximate Keplerian set (valid 1800–2050, good to a
   few arcminutes). A few arcminutes on a 500-pixel sky is a fraction of one
   chunky pixel, which is to say: exact.
   ========================================================================== */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const norm360 = (d) => ((d % 360) + 360) % 360;
const norm180 = (d) => norm360(d + 180) - 180;

/* Each element is [value at J2000, drift per century]. Distances in au, angles
   in degrees. `L` is the mean longitude, `peri` the longitude of perihelion,
   `node` the longitude of the ascending node. */
const ELEMENTS = {
  earth: {
    a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0, 0],
  },
  venus: {
    a: [0.72333566, 0.0000039], e: [0.00677672, -0.00004107], I: [3.39467605, -0.0007889],
    L: [181.9790995, 58517.81538729], peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418],
  },
  mars: {
    a: [1.52371034, 0.00001847], e: [0.0933941, 0.00007882], I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343],
  },
  jupiter: {
    a: [5.202887, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775], peri: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106],
  },
  saturn: {
    a: [9.53667594, -0.0012506], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201], peri: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794],
  },
};

/* What they look like — the only part of this file that is a choice rather than
   a consequence.

   All four are size 2, the same as the handful of stars this world calls bright,
   because that is what they are: every one of these outshines almost every star
   you can see. What separates them is the bloom, and that ranking is not taste
   either — it is their magnitudes. Venus is the third brightest object in the
   entire sky after the sun and the moon and it burns with a halo; Saturn is a
   steady, modest, unremarkable little light. Nobody needs to be told which is
   which. They will simply know. */
export const PLANETS = [
  { key: 'venus',   name: 'Venus',   rgb: [255, 250, 232], size: 2, bloom: 1.0 },
  { key: 'jupiter', name: 'Jupiter', rgb: [255, 238, 199], size: 2, bloom: 0.75 },
  { key: 'mars',    name: 'Mars',    rgb: [232, 122, 88],  size: 2, bloom: 0.4 },
  { key: 'saturn',  name: 'Saturn',  rgb: [230, 214, 160], size: 2, bloom: 0.3 },
];

const at = ([v, rate], T) => v + rate * T;

/** Kepler's equation, M = E − e·sin E, solved the way he couldn't: by iterating. */
function eccentricAnomaly(M, e) {
  let E = M + e * DEG * Math.sin(M * RAD);
  for (let i = 0; i < 8; i++) {
    const dM = M - (E - e * DEG * Math.sin(E * RAD));
    const dE = dM / (1 - e * Math.cos(E * RAD));
    E += dE;
    if (Math.abs(dE) < 1e-7) break;
  }
  return E;
}

/** Heliocentric ecliptic coordinates, in au. */
function heliocentric(el, T) {
  const a = at(el.a, T);
  const e = at(el.e, T);
  const I = at(el.I, T) * RAD;
  const node = at(el.node, T) * RAD;
  const peri = at(el.peri, T);
  const w = (peri - at(el.node, T)) * RAD; // argument of perihelion

  const M = norm180(at(el.L, T) - peri);
  const E = eccentricAnomaly(M, e) * RAD;

  // Position in the orbital plane, with the sun at a focus.
  const xo = a * (Math.cos(E) - e);
  const yo = a * Math.sqrt(1 - e * e) * Math.sin(E);

  // Rotate that plane into the ecliptic: by ω, then by I, then by Ω.
  const cw = Math.cos(w), sw = Math.sin(w);
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(I), si = Math.sin(I);

  return {
    x: (cw * cn - sw * sn * ci) * xo + (-sw * cn - cw * sn * ci) * yo,
    y: (cw * sn + sw * cn * ci) * xo + (-sw * sn + cw * cn * ci) * yo,
    z: sw * si * xo + cw * si * yo,
  };
}

/** The sky as seen from a place: ecliptic offset (au) → where to look. */
function look(gx, gy, gz, obl, lst, latR) {
  // Ecliptic → equatorial. Tilt by the obliquity and the sky's grid appears.
  const ex = gx;
  const ey = gy * Math.cos(obl) - gz * Math.sin(obl);
  const ez = gy * Math.sin(obl) + gz * Math.cos(obl);

  const ra = norm360(Math.atan2(ey, ex) * DEG);
  const dec = Math.atan2(ez, Math.hypot(ex, ey)) * DEG;

  // Hour angle: how far past the meridian it is. This is the sky turning.
  const ha = norm180(lst - ra);
  const haR = ha * RAD;
  const decR = dec * RAD;

  const sinAlt =
    Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(haR);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const cosAz =
    (Math.sin(decR) - Math.sin(latR) * sinAlt) / (Math.cos(latR) * Math.cos(alt) || 1e-9);
  const A = Math.acos(Math.max(-1, Math.min(1, cosAz))) * DEG;

  return {
    ra,
    dec,
    ha,
    alt: alt * DEG,
    az: Math.sin(haR) > 0 ? 360 - A : A,
    dist: Math.hypot(gx, gy, gz),
  };
}

/** The shared frame: everything below needs the same instant and the same sky. */
function frame(date, lat, lon) {
  const JD = date.getTime() / 86400000 + 2440587.5;
  const T = (JD - 2451545.0) / 36525;

  // Greenwich mean sidereal time, then local: the sky's own clock.
  const gmst = 280.46061837 + 360.98564736629 * (JD - 2451545.0) + 0.000387933 * T * T;

  return {
    T,
    earth: heliocentric(ELEMENTS.earth, T),
    obl: (23.43929111 - 0.0130042 * T) * RAD,
    lst: norm360(gmst + lon),
    latR: lat * RAD,
  };
}

/**
 * Everything wandering, right now.
 *
 * `alt` is degrees above the horizon (negative = it has set); `ha` is the hour
 * angle in degrees (0 = culminating, due south from the northern hemisphere).
 */
export function planetPositions(date, lat, lon) {
  const f = frame(date, lat, lon);

  return PLANETS.map((p) => {
    const h = heliocentric(ELEMENTS[p.key], f.T);

    // Geocentric: what WE see is the planet minus where we are standing.
    return {
      ...p,
      ...look(h.x - f.earth.x, h.y - f.earth.y, h.z - f.earth.z, f.obl, f.lst, f.latR),
    };
  });
}

/**
 * The real sun — not the stylised arc CelestialLayer paints, but the actual one,
 * in degrees above the actual horizon. Golden hour is a fact about this number.
 *
 * From the Earth, the sun is exactly where the Earth isn't.
 */
export function sunPosition(date, lat, lon) {
  const f = frame(date, lat, lon);
  return look(-f.earth.x, -f.earth.y, -f.earth.z, f.obl, f.lst, f.latR);
}
