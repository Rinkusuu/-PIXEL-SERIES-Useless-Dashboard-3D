/* ============================================================================
   store.js — tiny persistent state. localStorage-backed, debounced, and
   defensive: a corrupt or unavailable store (Safari private mode throws on
   write) must degrade to in-memory, never to a white screen.

   v2 is a MIGRATION, not a replacement: an old `uad.v1` is read once, cleaned
   by core/migrate.js, and written forward as `uad.v2`. The v1 key is never
   deleted, so a cached older build can still open, and nothing is lost if we
   ever need to roll back.
   ========================================================================== */

import { migrate } from './migrate.js';

const KEY = 'uad.v2';
const LEGACY_KEY = 'uad.v1';

const DEFAULTS = {
  sound: false, // opt-in, always. Autoplaying audio is a hostile act.
  motion: null, // null = follow the OS; true/false = user override
  volume: 0.6,

  coffee: 0,
  coins: 0,
  mood: 62,
  petName: 'Blip',
  petFed: 0,
  petLastFed: 0,

  /* The ambience mixer. Four beds you can raise ON TOP of whatever the weather
     is already doing — so you can have rain in your ears under a clear sky, or
     a fire crackling all summer. Nobody is stopping you. */
  mix: { rain: 0, wind: 0, crickets: 0, hearth: 0 },

  glass: false, // panels go clear, and the world comes up through the dashboard
  reactive: true, // let the world pulse with the music's bass
  seasonOverride: null, // null = the real calendar; else 'spring'|'summer'|'autumn'|'winter'

  achievements: [], // string ids
  inventory: [], // string ids
  visits: 0,
  firstSeen: 0,
  timeOverride: null, // null = live clock; 0–24 = frozen scene hour

  /* The last weather we genuinely fetched, with the moment we fetched it.
     Offline, this is shown INSTEAD of an invented sunny day — a real reading
     with an honest age beats a pleasant fiction with none. */
  lastWeather: null, // { model, at }

  // The play systems keep their own tallies. All of them are pointless.
  catches: [], // fish, by id
  skips: 0, // best stone-skip
  leaves: 0, // leaves caught
  stars: [], // constellations you drew: [{ name, pts: [starIndex…], at }]
  wishes: 0, // shooting stars caught mid-fall. They granted nothing.

  // ── v2: the walkable world ────────────────────────────────────────────────
  v: 2,
  mode: 'auto', // 'auto' (3D when WebGL2 exists) | 'classic' | '3d'
  player: null, // { x, y, z, yaw, pitch } — null wakes you in the loft bed
  view: { fov: 70, headBob: false, snapTurn: false, pointerLock: true, quality: 'auto' },
};

function read() {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    return migrate(raw ? JSON.parse(raw) : null, DEFAULTS);
  } catch {
    // Corrupt JSON or no storage at all. A clone, never DEFAULTS itself: its
    // arrays and `mix` must not be shared with live state.
    return structuredClone(DEFAULTS);
  }
}

const state = read();
let flushTimer = 0;
let dueBy = 0;

function flush() {
  clearTimeout(flushTimer);
  dueBy = 0;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — the session still works, it just won't persist */
  }
}

export const store = {
  get(key) {
    return state[key];
  },

  /** Write and schedule a flush. Writes are cheap; hitting disk 60×/s is not. */
  set(key, value) {
    state[key] = value;

    /* The debounce has a CEILING, and it is load-bearing.

       A plain debounce assumes writes come in bursts and then stop. A caller
       that writes every frame breaks that assumption completely: each set()
       cancels the pending flush and schedules a new one 250ms out, so the flush
       is pushed forever and NOTHING is ever persisted — the whole store survives
       only on the pagehide flush, and a crash takes the entire session with it.
       That is not hypothetical; MoodWidget's drift did exactly this.

       So the 250ms is how long we're willing to WAIT for quiet, and the 1s is
       how long we're willing to wait at all. */
    const now = Date.now();
    if (!dueBy) dueBy = now + 1000;

    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, Math.max(0, Math.min(250, dueBy - now)));

    return value;
  },

  /** Read-modify-write in one call: store.update('coins', c => c + 1) */
  update(key, fn) {
    return store.set(key, fn(state[key]));
  },

  all() {
    return { ...state };
  },

  reset() {
    Object.assign(state, structuredClone(DEFAULTS));
    flush();
  },
};

// Don't lose the last 250ms of state to a tab close.
addEventListener('pagehide', flush);
addEventListener('visibilitychange', () => document.hidden && flush());
