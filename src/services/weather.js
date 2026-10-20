/* ============================================================================
   weather.js — real weather, from Open-Meteo (no API key, no attribution
   requirement, generous free tier).

   The contract this module owns: it ALWAYS resolves. Geolocation denied, DNS
   down, API rate-limited, user on a plane — every path ends in a usable
   WeatherModel, because a dashboard whose sky is stuck on a spinner is worse
   than a dashboard showing plausible weather for a default city.

   The WeatherModel is deliberately small and scene-shaped: `kind` is one of the
   six words the palette and the WeatherLayer understand, and nothing downstream
   ever sees a WMO code.
   ========================================================================== */

import { store } from '../core/store.js';
import { bus } from '../core/bus.js';

const GEO_TIMEOUT = 6000;
const API_TIMEOUT = 7000;

/** The six conditions the world knows how to render. */
export const KINDS = ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'];

/**
 * WMO weather interpretation codes → our six kinds, plus a label and an icon.
 * https://open-meteo.com/en/docs — the codes are a WMO standard, not a vendor
 * invention, so this table is stable.
 */
const WMO = {
  0:  ['clear',  'Clear sky',           '☀️'],
  1:  ['clear',  'Mainly clear',        '🌤️'],
  2:  ['cloudy', 'Partly cloudy',       '⛅'],
  3:  ['cloudy', 'Overcast',            '☁️'],
  45: ['fog',    'Fog',                 '🌫️'],
  48: ['fog',    'Freezing fog',        '🌫️'],
  51: ['rain',   'Light drizzle',       '🌦️'],
  53: ['rain',   'Drizzle',             '🌦️'],
  55: ['rain',   'Heavy drizzle',       '🌧️'],
  56: ['rain',   'Freezing drizzle',    '🌧️'],
  57: ['rain',   'Freezing drizzle',    '🌧️'],
  61: ['rain',   'Light rain',          '🌦️'],
  63: ['rain',   'Rain',                '🌧️'],
  65: ['rain',   'Heavy rain',          '🌧️'],
  66: ['rain',   'Freezing rain',       '🌧️'],
  67: ['rain',   'Freezing rain',       '🌧️'],
  71: ['snow',   'Light snow',          '🌨️'],
  73: ['snow',   'Snow',                '❄️'],
  75: ['snow',   'Heavy snow',          '❄️'],
  77: ['snow',   'Snow grains',         '❄️'],
  80: ['rain',   'Rain showers',        '🌦️'],
  81: ['rain',   'Rain showers',        '🌧️'],
  82: ['rain',   'Violent showers',     '⛈️'],
  85: ['snow',   'Snow showers',        '🌨️'],
  86: ['snow',   'Snow showers',        '❄️'],
  95: ['storm',  'Thunderstorm',        '⛈️'],
  96: ['storm',  'Storm with hail',     '⛈️'],
  99: ['storm',  'Severe storm',        '⛈️'],
};

/**
 * Where we look when we genuinely cannot know where you are.
 *
 * This used to be called "Somewhere Cosy" — a charming name for a set of
 * coordinates that are, in fact, London. So a user in Jakarta who declined the
 * location prompt was shown London's real weather under a made-up name, with a
 * footnote murmuring "showing a place that is probably nice". London drizzles.
 * They saw "Light drizzle", looked out of the window at a dry, cloudy sky, and
 * quite reasonably concluded the weather was broken.
 *
 * It wasn't broken. It was being coy, which is worse. If we're showing you
 * somewhere else's sky, we say whose.
 */
const FALLBACK = {
  place: 'London',
  region: 'United Kingdom',
  lat: 51.5,
  lon: -0.12,
  fallback: true,
};

/** fetch with a timeout — a hanging request is worse than a failed one. */
async function fetchJSON(url, timeout = API_TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    bus.emit('net:ok');
    return json;
  } catch (err) {
    // The one place in the app that reliably talks to the internet is the one
    // place that gets to decide whether the internet is there.
    bus.emit('net:fail');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the browser where we are. Never rejects — a denial is a normal, expected
 * outcome and is handled by falling back, not by throwing.
 */
function locate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);

    const done = (v) => resolve(v);
    navigator.geolocation.getCurrentPosition(
      (pos) => done({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => done(null), // denied, unavailable, timed out — all the same to us
      { timeout: GEO_TIMEOUT, maximumAge: 30 * 60 * 1000, enableHighAccuracy: false }
    );
  });
}

/** Turn coordinates into a place name. Best-effort; a nameless place is fine. */
async function reverseGeocode(lat, lon) {
  try {
    const d = await fetchJSON(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      4000
    );
    return {
      place: d.city || d.locality || d.principalSubdivision || 'Somewhere',
      region: d.countryName || '',
    };
  } catch {
    return { place: 'Somewhere', region: '' };
  }
}

/**
 * Reconcile the forecast's OPINION with the sky's MEASUREMENT.
 *
 * `weather_code` is what a numerical model thinks is happening in your grid
 * square. `precipitation` is how many millimetres actually fell there in the
 * last hour. They disagree more often than you'd hope, and they disagree in one
 * particular direction: the drizzle codes (51–57) fire constantly over humid
 * ground where nothing is falling at all.
 *
 * We were taking the code at its word. Code 51 → kind 'rain' → the world turned
 * grey, a curtain of rain fell across the meadow, and the rain bed came up in
 * the speakers, all because a model in Germany suspected it might be spitting.
 *
 * So: when the code claims water is falling and the gauge says none is, the
 * gauge wins, and we describe the sky by how much of it is covered instead.
 * `cloud_cover` is a real observation and it's the honest answer to "what is it
 * doing outside" when the answer is "nothing, it's just grey".
 *
 * @returns {[kind, label, icon, intensity]} — intensity 0–1, how hard it falls.
 */
function reconcile(code, precipMm, cloudPct) {
  const [kind, label, icon] = WMO[code] ?? ['cloudy', 'Weather', '🌍'];

  const falling = kind === 'rain' || kind === 'snow' || kind === 'storm';

  // Nothing is coming out of the sky. Whatever the code says, it is not raining.
  if (falling && precipMm != null && precipMm < 0.05) {
    if (cloudPct == null) return ['cloudy', 'Overcast', '☁️', 0];
    if (cloudPct < 20) return ['clear', 'Clear sky', '☀️', 0];
    if (cloudPct < 55) return ['clear', 'Mainly clear', '🌤️', 0];
    if (cloudPct < 85) return ['cloudy', 'Partly cloudy', '⛅', 0];
    return ['cloudy', 'Overcast', '☁️', 0];
  }

  /* It IS falling — so how hard? A 0.2mm/h drizzle and an 8mm/h downpour were
     both rendered as the same wall of water, which is its own small lie. About
     4mm in an hour is properly heavy rain; scale to that, and never go all the
     way to zero or 'rain' would render as nothing at all. */
  const intensity = falling && precipMm != null
    ? clamp(precipMm / 4, 0.22, 1)
    : falling ? 0.7 : 0;

  return [kind, label, icon, intensity];
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** "2026-07-13T05:12" → 5.2 (hours, local to the reported timezone). */
function isoToHour(iso) {
  if (!iso) return null;
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}

/**
 * The one public call.
 * @returns {Promise<WeatherModel>} — always resolves.
 */
export async function getWeather() {
  const pos = await locate();
  const coords = pos ?? FALLBACK;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${coords.lat.toFixed(3)}&longitude=${coords.lon.toFixed(3)}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,` +
      // precipitation + cloud_cover are what let us check the forecast's
      // homework. Without them all we have is the model's word for it.
      `weather_code,wind_speed_10m,is_day,precipitation,cloud_cover` +
      `&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min` +
      `&timezone=auto&forecast_days=1`;

    // Fire both requests at once — the name lookup shouldn't gate the weather.
    const [data, named] = await Promise.all([
      fetchJSON(url),
      pos ? reverseGeocode(coords.lat, coords.lon) : Promise.resolve(FALLBACK),
    ]);

    const c = data.current;
    const d = data.daily;

    const [kind, label, icon, intensity] = reconcile(
      c.weather_code,
      c.precipitation,
      c.cloud_cover
    );

    // Did we have to overrule the forecast? The panel says so — quietly, but it
    // says so. We don't get to silently disagree with our own source.
    const [rawKind] = WMO[c.weather_code] ?? ['cloudy'];
    const corrected = rawKind !== kind;

    const model = {
      ok: true,
      fallback: !pos,
      place: named.place,
      region: named.region,

      // Everything downstream that needs to know WHERE we are gets it from here:
      // the seasons (to flip the hemisphere), the sun's arc height (latitude
      // decides how high it climbs), and the ISS tracker (to work out whether
      // the station is actually above your head right now).
      lat: coords.lat,
      lon: coords.lon,

      kind,
      label,
      icon,
      code: c.weather_code,

      // How hard it's actually falling, 0–1. The scene renders a drizzle as a
      // drizzle now, instead of as a downpour with a different name.
      intensity,
      precipMm: c.precipitation,
      cloudPct: c.cloud_cover,
      corrected,

      tempC: c.temperature_2m,
      feelsC: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      windKph: c.wind_speed_10m,
      isDay: c.is_day === 1,

      maxC: d?.temperature_2m_max?.[0] ?? null,
      minC: d?.temperature_2m_min?.[0] ?? null,

      sunrise: d?.sunrise?.[0] ?? null,
      sunset: d?.sunset?.[0] ?? null,
      sunriseHour: isoToHour(d?.sunrise?.[0]) ?? 6,
      sunsetHour: isoToHour(d?.sunset?.[0]) ?? 19.5,

      timezone: data.timezone,
    };

    /* Remember it. This is the reading we'll show — honestly aged — the next
       time someone opens the dashboard on a train. */
    store.set('lastWeather', { model, at: Date.now() });

    return model;
  } catch (err) {
    console.warn('[weather] no network:', err.message);
    return lastKnownModel();
  }
}

/**
 * The weather we saw last, and how long ago we saw it.
 *
 * This is the honest answer to "what's it doing outside" when we can't ask. It
 * is REAL weather — your weather, from your city — it is simply old, and the
 * panel says exactly how old. Two hours stale beats `offlineModel()`'s cheerful
 * 21°C and clear skies, which is not true anywhere and never was.
 *
 * We only fall through to the invented day if there has never been a real
 * reading to remember — a first visit, offline.
 */
export function lastKnownModel() {
  const cached = store.get('lastWeather');
  if (!cached?.model) return offlineModel();

  const ageMin = Math.max(0, Math.round((Date.now() - cached.at) / 60000));

  return {
    ...cached.model,
    ok: false,
    stale: true,
    ageMin,
    synthetic: false,
  };
}

/**
 * The weather we invent when we can't fetch any.
 *
 * Note the difference between this and FALLBACK. If we can't find YOU but we can
 * still reach the network, we fetch London's real weather and we tell you it's
 * London's. If we can't reach the network at all, there is no real weather
 * anywhere in this object — so it doesn't get a real place name. "Somewhere
 * Cosy" is not a coy alias for a city here; it is an admission that this is
 * fiction, and `ok: false` is how the UI knows to say so out loud.
 */
export function offlineModel() {
  return {
    ok: false,
    fallback: true,
    offline: true,
    place: 'Somewhere Cosy',
    region: '',
    lat: FALLBACK.lat,
    lon: FALLBACK.lon,
    kind: 'clear',
    label: 'Probably lovely',
    icon: '🌤️',
    code: 1,
    intensity: 0,
    precipMm: 0,
    cloudPct: 20,
    corrected: false,
    tempC: 21,
    feelsC: 21,
    humidity: 55,
    windKph: 9,
    isDay: true,
    maxC: 24,
    minC: 14,
    sunrise: null,
    sunset: null,
    sunriseHour: 6,
    sunsetHour: 19.5,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** The scene can be driven by hand from the weather widget's condition strip. */
export function syntheticModel(kind, base) {
  const label = { clear: 'Clear sky', cloudy: 'Overcast', fog: 'Fog', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorm' }[kind];
  const icon = { clear: '☀️', cloudy: '☁️', fog: '🌫️', rain: '🌧️', snow: '❄️', storm: '⛈️' }[kind];

  // If you press "rain" you want rain, not the 0.3mm of drizzle that happens to
  // be falling on you right now. A forced sky is a full sky.
  const intensity = { storm: 1, rain: 0.85, snow: 0.8 }[kind] ?? 0;

  return { ...base, kind, label, icon, intensity, corrected: false, synthetic: true };
}
