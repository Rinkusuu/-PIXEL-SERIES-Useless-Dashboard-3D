/* ============================================================================
   env.js — the state of the world, independent of how it is drawn.

   Weather, wind, the hour, the season, the palette, how much snow is lying,
   how cut off we are, the music's bass and Zen's breath. This used to live
   inside classic/Scene.js; it moved out because the 3D world needs exactly the
   same answers, and two renderers each deciding what time it is would be the
   horizon.js story all over again.

   A renderer calls `env.update(tick)` once per frame, first, and then reads
   `env.state`. Only one renderer runs at a time.
   ========================================================================== */

import { bus } from './bus.js';
import { store } from './store.js';
import { audio } from './audio.js';
import { motion } from './motion.js';
import { net } from './net.js';
import { zen } from './zen.js';
import { getPalette } from '../sky/palette.js';
import { getSeason } from '../sky/season.js';
import { applyPaletteToDOM } from '../ui/palette-dom.js';
import { clamp, damp, lerp } from './util.js';

class Environment {
  constructor() {
    this.weather = 'clear';
    this.wind = 0.3;
    this.precip = 1; // 0–1, how hard it is actually falling
    this._offline = net.online ? 0 : 1; // eased, so the fog rolls in
    this.sun = null; // { sunriseHour, sunsetHour } once the weather resolves
    this.lat = 45; // until the weather tells us better
    /* Until then, guess the longitude from the clock: 15° per hour of UTC offset.
       A default of 0° put the sun high over Greenwich at 22:30 in Jakarta — a
       night palette with a noon sun in it. This keeps the sky consistent with
       the clock from the first frame. */
    this.lon = -new Date().getTimezoneOffset() / 4;
    this.place = ''; // for the postcard; the world itself never needs the name

    this._paletteClock = 0;
    this._seasonClock = 0;
    this._phaseKey = '';
    this._seasonKey = '';

    this.state = {
      t: 0, dt: 0,
      pal: getPalette(12, 'clear'),
      season: getSeason(new Date(), 45, null),
      weather: 'clear',
      wind: 0.3,
      precip: 1,
      offline: 0, // 0–1: how cut off the world is
      sun: null,
      hour: 12,
      lat: 45,
      lon: this.lon, // the sky needs it: sidereal time is a fact about your longitude

      /* How much snow is LYING on the ground, 0–1 — which is not the same thing
         as whether it is snowing, and was not the same thing as what season it
         is either. See `_settleSnow`. */
      snow: 0,
      quality: 1,
      motion: 1,

      // The world's two "living" signals, both 0–1:
      //   bass   — how hard the music is hitting right now
      //   beat   — true for exactly one frame, on each kick
      //   breath — Zen mode's breathing cycle; 0.5 (neutral) when Zen is off
      bass: 0,
      beat: false,
      breath: 0.5,
      zen: false,
    };

    bus.on('weather', (w) => {
      this.weather = w.kind;
      this.wind = clamp(w.windKph / 40, 0.05, 1);
      // A 0.2mm drizzle and an 8mm downpour are both 'rain'. This is the number
      // that tells them apart, and it reaches the raindrops and the rain bed.
      this.precip = typeof w.intensity === 'number' ? w.intensity : 1;
      this.sun = { sunriseHour: w.sunriseHour, sunsetHour: w.sunsetHour };
      if (typeof w.lat === 'number') {
        this.lat = w.lat;
        this.lon = w.lon;
      }
      this.place = [w.place, w.region].filter(Boolean).join(', ');

      /* THE AMBIENCE BUG LIVED HERE — or rather, it lived in this line's
         absence. setAmbience() used to be called ONLY from the day/night phase
         check below, so switching the weather never touched the audio: force a
         storm and the rain bed stayed silent, then clear the sky and the rain
         kept pouring into your ears until the next phase boundary, hours later.
         Weather changed → the ambience changes. Now it actually does. */
      audio.setAmbience({
        kind: this.weather,
        night: this.state.pal.night,
        wind: this.wind,
        precip: this.precip,
      });
    });

    // Zen's breathing, and the season override, both arrive on the bus.
    bus.on('zen', (z) => { this.state.zen = z.active; });
    bus.on('season:override', () => { this._seasonClock = 0; });
  }

  /** The scene hour: the real local time, unless the user froze it. */
  get hour() {
    const override = store.get('timeOverride');
    if (override != null) return override;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  /* ── Snow that stays ────────────────────────────────────────────────────────
     The meadow has known how to WEAR snow since long before this: it lies in
     drifts, it buries the grass to different depths, it crumbles into the blades
     at its edges. What it didn't know was how snow ARRIVES.

     `season.snow` was the whole story — winter meant white, spring meant green,
     and actual falling snow changed nothing on the ground. You could stand in a
     blizzard on a green lawn.

     So that number stops being the ground's VALUE and becomes its RESTING LEVEL:
     the depth this ground settles to when nothing is happening to it. Snowfall
     pushes it up from there, and when the snow stops, it melts back down. Which
     means a spring flurry now leaves the meadow briefly, wrongly, beautifully
     white — and then it's gone, the way a spring flurry is.

     Melt is the slow half deliberately. Snow takes minutes to lay and it takes
     an afternoon to go, and a meadow that thawed as fast as it froze would feel
     like a light switch. -------------------------------------------------- */
  _settleSnow(s, dt) {
    const resting = s.season?.snow ?? 0;
    const snowing = this.weather === 'snow';
    const target = snowing ? 1 : resting;

    // First weather of the session. If it's already snowing, it has been snowing
    // for a while — the world did not begin when you opened the tab.
    if (this._snow == null) {
      this._snow = snowing ? Math.max(0.6, resting) : resting;
    }

    // Falling snow settles in a couple of minutes. Melting is slow in a winter
    // that keeps it, and quick in a spring that doesn't want it.
    const rate = snowing ? 0.015 : lerp(0.03, 0.004, resting);

    this._snow = damp(this._snow, target, rate, dt);
    s.snow = this._snow;
  }

  update({ t, dt, quality }) {
    const s = this.state;
    s.t = t;
    s.dt = dt;
    s.quality = quality;
    s.weather = this.weather;
    s.wind = this.wind;
    s.precip = this.precip;

    /* LOSING THE NETWORK IS WEATHER.

       There is no red banner and no error toast. The connection drops and the
       world quietly fogs over and loses a little of its colour; it comes back
       and the fog lifts. You find out you're offline the same way you'd find out
       it had started to rain — by looking outside.

       Eased over ~4 seconds, because a world that snaps into fog is a world
       announcing a state change, which is precisely the thing we're avoiding. */
    this._offline = damp(this._offline, net.online ? 0 : 1, 0.35, dt);
    s.offline = this._offline;
    s.sun = this.sun;
    s.hour = this.hour;

    this._settleSnow(s, dt);

    /* s.motion is 1 or 0, and renderers MULTIPLY their drift velocities by it.
       Reduced motion has to reach into the world, not just the CSS: the CSS
       toggle stops the panels bobbing, but it does nothing about a sky full of
       drifting cloud, falling rain and full-screen lightning — which is the
       large-area motion that actually causes vestibular trouble, and, in
       lightning's case, is a photosensitivity concern on its own terms. */
    const m = motion.enabled ? 1 : 0;
    s.motion = m;

    // ── Music energy ────────────────────────────────────────────────────────
    // Reduced motion kills the reactivity entirely: a world that pulses on every
    // kick drum is, by definition, a world in constant motion.
    const reactive = store.get('reactive') && m;
    const e = audio.energy(dt);
    s.bass = reactive ? e.bass : 0;
    s.beat = reactive ? e.beat : false;

    // ── Breath ──────────────────────────────────────────────────────────────
    s.breath = zen.breath;
    s.zen = zen.active;

    // ── Season ──────────────────────────────────────────────────────────────
    // The date does not change quickly. Once every 10 seconds is generous.
    this._seasonClock -= dt;
    if (this._seasonClock <= 0) {
      this._seasonClock = 10;
      s.season = getSeason(new Date(), this.lat, store.get('seasonOverride'));
      s.lat = this.lat;
      s.lon = this.lon;

      if (s.season.key !== this._seasonKey) {
        this._seasonKey = s.season.key;
        bus.emit('season', s.season);
      }
    }

    // The palette is expensive-ish and imperceptible frame to frame. 4Hz.
    this._paletteClock -= dt;
    if (this._paletteClock <= 0) {
      this._paletteClock = 0.25;
      s.pal = getPalette(s.hour, this.weather, s.season, s.breath);
      applyPaletteToDOM(s.pal);

      if (s.pal.key !== this._phaseKey) {
        this._phaseKey = s.pal.key;
        bus.emit('phase', s.pal);
        audio.setAmbience({
          kind: this.weather,
          night: s.pal.night,
          wind: this.wind,
          precip: this.precip,
        });
      }
    }

    return s;
  }
}

export const env = new Environment();
