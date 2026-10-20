/* ============================================================================
   iss.js — where the International Space Station actually is, right now.

   The API is wheretheiss.at: free, no key, CORS-open, and it returns a real
   position derived from real orbital elements. There are seven people up there
   and this tells you where.

   The maths below turns "the ISS is at 41.2°N, 12.5°E, 421km up" and "you are
   at 52.5°N, 13.4°E" into "it is 38° above your horizon, to the south-west" —
   which is what the sky layer needs to draw it in the right place.

   Two deliberate simplifications, stated honestly:
     · A SPHERICAL earth. The real one is an oblate spheroid, which shifts the
       elevation by a few tenths of a degree. Irrelevant at pixel resolution.
     · No refraction correction near the horizon. Same reason.
   Neither affects whether the dot is in the right part of your sky.
   ========================================================================== */

const ENDPOINT = 'https://api.wheretheiss.at/v1/satellites/25544';

const R_EARTH = 6371; // km
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Great-circle distance between two lat/lon points, in km. */
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * D2R;
  const dLon = (lon2 - lon1) * D2R;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing from the observer to the target, 0–360° (0 = north). */
export function bearing(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * D2R;
  const φ2 = lat2 * D2R;
  const Δλ = (lon2 - lon1) * D2R;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

/**
 * The elevation of a satellite above your local horizon, in degrees.
 * Negative means it's below the horizon — on the other side of the planet.
 *
 * The key term is the earth's CURVATURE. Naively you'd take atan(altitude /
 * groundDistance), but that ignores the fact that the ground curves away from
 * you: at 2000km away the ISS is not "over there and up a bit", it's over the
 * horizon and sinking. This is the standard look-angle formula and it handles it.
 */
export function elevation(groundKm, altKm) {
  // Central angle subtended at the earth's core by the ground track.
  const γ = groundKm / R_EARTH;
  const rs = R_EARTH + altKm;
  // Elevation above the local tangent plane.
  return Math.atan2(Math.cos(γ) - R_EARTH / rs, Math.sin(γ)) * R2D;
}

/** Line-of-sight (slant) range from you to the station, in km. */
export function slantRange(groundKm, altKm) {
  const γ = groundKm / R_EARTH;
  const rs = R_EARTH + altKm;
  return Math.sqrt(R_EARTH ** 2 + rs ** 2 - 2 * R_EARTH * rs * Math.cos(γ));
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (deg) => COMPASS[Math.round(deg / 45) % 8];

/**
 * Fetch the station's current state, and work out what it looks like from where
 * the observer is standing.
 *
 * @returns {Promise<object|null>} null on any failure — the caller degrades.
 */
/**
 * Given the station's position and yours, work out what you'd actually see.
 * Split out of getISS so the DEAD-RECKONED position can use exactly the same
 * geometry as the fetched one — two code paths computing "where do I look" is
 * two chances to disagree about which way south is.
 */
function observe(iss, obsLat, obsLon) {
  if (obsLat == null || obsLon == null) return iss;

  const ground = haversine(obsLat, obsLon, iss.lat, iss.lon);
  iss.groundKm = ground;
  iss.rangeKm = slantRange(ground, iss.altKm);
  iss.elevation = elevation(ground, iss.altKm);
  iss.azimuth = bearing(obsLat, obsLon, iss.lat, iss.lon);
  iss.compass = compass(iss.azimuth);

  iss.up = iss.elevation > 0;
  /* …and actually SEEABLE. A real ISS sighting needs three things at once: it
     must be above your horizon, it must be lit by the sun, and YOUR sky must be
     dark. That's why sightings only happen for an hour or two after dusk and
     before dawn — and it's why we track `sunlit` at all. The caller supplies the
     darkness. */
  iss.visible = iss.up && iss.sunlit;
  return iss;
}

/**
 * DEAD RECKONING — where the station is now, given where it was then.
 *
 * The ISS does not improvise. It is a 420-tonne object in a near-circular orbit
 * at 7.66 km/s, and over a few minutes its future is arithmetic: it advances
 * along its ground track at a known angular rate, on a path inclined 51.6° to
 * the equator.
 *
 * So when the network goes, the dot does NOT freeze in the sky. Freezing would
 * be a lie — the station is emphatically still moving — and it would be the most
 * visible lie in the app, because a stationary "satellite" is just a star.
 * Instead we keep flying it from the last real fix, and we SAY the position is
 * estimated. Physics is a perfectly good data source when the internet isn't.
 *
 * Error grows at roughly a degree a minute, which is why the widget stops
 * claiming a sighting once the fix is properly old.
 */
export function reckon(last, obsLat = null, obsLon = null, now = Date.now()) {
  if (!last) return null;

  const dtSec = (now - last.at) / 1000;
  if (dtSec < 0) return last;

  // Angular rate along the orbit: v / r, in degrees per second.
  const R = 6371;
  const degPerSec = (last.speedKph / 3600 / (R + last.altKm)) * (180 / Math.PI);
  const travelled = degPerSec * dtSec;

  const INC = 51.6; // the station's orbital inclination
  const rad = Math.PI / 180;

  /* Advance along the ground track. The heading at a given latitude on an
     inclined orbit follows from spherical trig: cos(i) = cos(lat)·sin(heading).
     Ascending or descending is inferred from the last two fixes if we have
     them, and assumed ascending if we don't. */
  const cosLat = Math.cos(last.lat * rad);
  const sinH = cosLat > 1e-6 ? clampAbs(Math.cos(INC * rad) / cosLat, 1) : 1;
  const heading = Math.asin(sinH); // radians, from north
  const dir = last.ascending === false ? -1 : 1;

  const dLat = travelled * Math.cos(heading) * dir;
  const dLon = cosLat > 1e-6 ? (travelled * Math.sin(heading)) / cosLat : 0;

  let lat = last.lat + dLat;
  let ascending = dir > 0;

  // Bounce off the orbit's turning points — it can't go past ±51.6°.
  if (lat > INC) { lat = 2 * INC - lat; ascending = false; }
  if (lat < -INC) { lat = -2 * INC - lat; ascending = true; }

  let lon = last.lon + dLon;
  // Earth turns under it: ~0.004178°/s of westward drift in the ground track.
  lon -= 0.004178 * dtSec;
  lon = ((lon + 540) % 360) - 180;

  const iss = {
    lat,
    lon,
    altKm: last.altKm,
    speedKph: last.speedKph,
    sunlit: last.sunlit,
    ascending,
    at: now,
    estimated: true,
    ageSec: Math.round(dtSec),
  };

  return observe(iss, obsLat, obsLon);
}

const clampAbs = (v, m) => (v > m ? m : v < -m ? -m : v);

export async function getISS(obsLat = null, obsLon = null) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);

  try {
    const res = await fetch(ENDPOINT, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();

    const iss = {
      lat: d.latitude,
      lon: d.longitude,
      altKm: d.altitude, // ~408–430
      speedKph: d.velocity, // ~27,600
      /** 'daylight' | 'eclipsed' — whether the station is in the earth's shadow */
      sunlit: d.visibility === 'daylight',
      at: Date.now(),
    };

    return observe(iss, obsLat, obsLon);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
