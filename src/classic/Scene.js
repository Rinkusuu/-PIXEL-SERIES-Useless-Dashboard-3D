/* ============================================================================
   Scene.js — owns the two canvases, the resolution policy, the camera, and the
   env object every layer reads from.

   RESOLUTION POLICY (the most important 10 lines in the project):

     We do NOT render at devicePixelRatio. We render into a buffer roughly 480px
     wide and let CSS blow it up with `image-rendering: pixelated`. On a 5K
     display that's a 12× upscale — which is not a compromise, it IS the art
     direction. It also means the fill cost is constant regardless of monitor:
     a 27" 5K iMac and a phone both rasterise ~140,000 pixels per frame.

     The scale factor is chosen so the buffer lands near a target height and so
     the upscale is an INTEGER where possible. A non-integer upscale of pixel
     art produces unevenly-sized pixels — some 3px wide, some 4 — and the eye
     picks it up instantly as "cheap emulator".

   THE GLOW BUFFER:

     A second, same-size canvas. Layers draw only their emissive parts into it.
     CSS blurs it and screen-blends it over the scene. That's real bloom for the
     price of one blur on a 480px image, versus a multi-pass shader.
   ========================================================================== */

import { bus } from '../core/bus.js';
import { store } from '../core/store.js';
import { audio } from '../core/audio.js';
import { motion } from '../core/motion.js';
import { net } from '../core/net.js';
import { zen } from '../core/zen.js';
import { getPalette } from '../sky/palette.js';
import { applyPaletteToDOM } from '../ui/palette-dom.js';
import { getSeason } from '../sky/season.js';
import { glowDot } from '../ui/pixel.js';
import { clamp, damp, lerp, rgbCss } from '../core/util.js';

import { SkyLayer } from './layers/SkyLayer.js';
import { StarsLayer } from './layers/StarsLayer.js';
import { IssLayer } from './layers/IssLayer.js';
import { CelestialLayer } from './layers/CelestialLayer.js';
import { PetLayer } from './layers/PetLayer.js';
import { CloudsLayer } from './layers/CloudsLayer.js';
import { MountainsLayer } from './layers/MountainsLayer.js';
import { ForestLayer } from './layers/ForestLayer.js';
import { WaterLayer } from './layers/WaterLayer.js';
import { FishingLayer } from './layers/FishingLayer.js';
import { StonesLayer } from './layers/StonesLayer.js';
import { MeadowLayer } from './layers/MeadowLayer.js';
import { CrittersLayer } from './layers/CrittersLayer.js';
import { WeatherLayer } from './layers/WeatherLayer.js';
import { FogLayer } from './layers/FogLayer.js';

const TARGET_H = 270; // logical scene height, in chunky pixels
const MAX_PARALLAX = 9; // logical px the camera may travel. More = seasick.

export class Scene {
  constructor(sceneCanvas, glowCanvas) {
    this.cv = sceneCanvas;
    this.gcv = glowCanvas;
    this.g = sceneCanvas.getContext('2d', { alpha: false });
    this.gg = glowCanvas.getContext('2d', { alpha: true });

    this.g.imageSmoothingEnabled = false;
    this.gg.imageSmoothingEnabled = false;

    // Back to front. This array IS the depth order of the world.
    this.layers = [
      new SkyLayer(),
      new StarsLayer(),
      new IssLayer(), // among the stars, because that is where it is
      new CelestialLayer(),
      new CloudsLayer(),
      new MountainsLayer(),
      new ForestLayer(),
      new WaterLayer(),
      new FishingLayer(), // on the lake, under the near bank
      new StonesLayer(),
      new MeadowLayer(),
      new PetLayer(), // it lives in the grass, in front of it
      new CrittersLayer(),
      new WeatherLayer(),
      new FogLayer(), // must be last: it grades the finished frame
    ];

    this.weather = 'clear';
    this.wind = 0.3;
    this.precip = 1; // 0–1, how hard it is actually falling
    this._offline = net.online ? 0 : 1; // eased, so the fog rolls in
    this.sun = null; // { sunriseHour, sunsetHour } once the weather resolves
    this.lat = 45; // until the weather tells us better
    this.lon = 0;

    this._mouse = { x: 0, y: 0 };
    this._cam = { x: 0, y: 0 };
    this._paletteClock = 0;
    this._seasonClock = 0;
    this._phaseKey = '';
    this._seasonKey = '';

    /* The pointer, in SCENE coordinates (chunky logical pixels), not CSS pixels.
       Layers push things away from it, part grass around it, and light a lantern
       under it — all of which need it in the same space they're drawing in. */
    this._pointer = { x: -999, y: -999, vx: 0, vy: 0, active: false, moved: 0 };

    this.env = {
      W: 0, H: 0, t: 0, dt: 0,
      pal: getPalette(12, 'clear'),
      season: getSeason(new Date(), 45, null),
      weather: 'clear',
      wind: 0.3,
      precip: 1,
      offline: 0, // 0–1: how cut off the world is
      sun: null,
      hour: 12,
      lat: 45,
      lon: 0, // the sky needs it: sidereal time is a fact about your longitude

      /* How much snow is LYING on the ground, 0–1 — which is not the same thing
         as whether it is snowing, and was not the same thing as what season it
         is either. See `_settleSnow`. */
      snow: 0,
      parallax: this._cam,
      pointer: this._pointer,
      glow: this.gg,
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

    this._bind();
    this.resize();
  }

  _bind() {
    addEventListener('resize', () => this.resize(), { passive: true });

    // Mouse parallax + the world-space pointer. We only RECORD here; the easing
    // happens in the tick, so a 1000Hz mouse can't make us do 1000 layouts/sec.
    addEventListener('pointermove', (e) => {
      this._mouse.x = (e.clientX / innerWidth) * 2 - 1;
      this._mouse.y = (e.clientY / innerHeight) * 2 - 1;

      // Into scene space. `scale` is the integer upscale factor, so dividing by
      // it lands us exactly in the buffer's coordinate system.
      const p = this._pointer;
      const nx = e.clientX / this.scale;
      const ny = e.clientY / this.scale;
      p.vx = nx - p.x;
      p.vy = ny - p.y;
      p.x = nx;
      p.y = ny;
      p.active = true;
      p.moved = 0.35; // seconds of "recently moved", decayed in the tick
    }, { passive: true });

    // A pointer that has left the window must stop disturbing the grass.
    addEventListener('pointerleave', () => { this._pointer.active = false; }, { passive: true });
    addEventListener('blur', () => { this._pointer.active = false; }, { passive: true });

    /* A click on THE WORLD — in scene coordinates, and only when it really is the
       world. The panels float above the canvas, so a click on a slider or a
       button lands on the panel, not here; without this guard, dragging the
       volume fader would cast a fishing line into the lake behind it. */
    addEventListener('pointerdown', (e) => {
      if (e.target?.closest?.('.panel, .topbar, .footer, .cmd, .zen, .toasts')) return;
      bus.emit('scene:click', {
        x: e.clientX / this.scale,
        y: e.clientY / this.scale,
      });
    });

    // Touch devices get parallax from device tilt instead — same feeling,
    // no pointer required. Silently absent if the sensor/permission isn't there.
    addEventListener('deviceorientation', (e) => {
      if (e.gamma == null || e.beta == null) return;
      this._mouse.x = clamp(e.gamma / 30, -1, 1);
      this._mouse.y = clamp((e.beta - 45) / 30, -1, 1);
    }, { passive: true });

    bus.on('tick', (t) => this.frame(t));

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

      /* THE AMBIENCE BUG LIVED HERE — or rather, it lived in this line's
         absence. setAmbience() used to be called ONLY from the day/night phase
         check below, so switching the weather never touched the audio: force a
         storm and the rain bed stayed silent, then clear the sky and the rain
         kept pouring into your ears until the next phase boundary, hours later.
         Weather changed → the ambience changes. Now it actually does. */
      audio.setAmbience({
        kind: this.weather,
        night: this.env.pal.night,
        wind: this.wind,
        precip: this.precip,
      });
    });

    // Zen's breathing, and the season override, both arrive on the bus.
    bus.on('zen', (z) => { this.env.zen = z.active; });
    bus.on('season:override', () => { this._seasonClock = 0; });
  }

  resize() {
    const vw = Math.max(1, innerWidth);
    const vh = Math.max(1, innerHeight);

    /* Choose the integer upscale that lands the buffer height nearest TARGET_H.
       Then the buffer is exactly vw/scale × vh/scale, and every scene pixel maps
       to a perfect `scale × scale` block of screen pixels. */
    const scale = clamp(Math.round(vh / TARGET_H), 2, 8);

    const W = Math.ceil(vw / scale);
    const H = Math.ceil(vh / scale);

    for (const cv of [this.cv, this.gcv]) {
      cv.width = W;
      cv.height = H;
    }
    // The contexts are reset by a size change — re-disable smoothing.
    this.g.imageSmoothingEnabled = false;
    this.gg.imageSmoothingEnabled = false;

    this.env.W = W;
    this.env.H = H;
    this.scale = scale;

    for (const l of this.layers) l.resize(W, H, this.env);
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
  _settleSnow(env, dt) {
    const resting = env.season?.snow ?? 0;
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
    env.snow = this._snow;
  }

  /** The scene hour: the real local time, unless the user froze it. */
  get hour() {
    const override = store.get('timeOverride');
    if (override != null) return override;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  frame({ t, dt, quality }) {
    const env = this.env;
    env.t = t;
    env.dt = dt;
    env.quality = quality;
    env.weather = this.weather;
    env.wind = this.wind;
    env.precip = this.precip;

    /* LOSING THE NETWORK IS WEATHER.

       There is no red banner and no error toast. The connection drops and the
       world quietly fogs over and loses a little of its colour; it comes back
       and the fog lifts. You find out you're offline the same way you'd find out
       it had started to rain — by looking outside.

       Eased over ~4 seconds, because a world that snaps into fog is a world
       announcing a state change, which is precisely the thing we're avoiding. */
    this._offline = damp(this._offline, net.online ? 0 : 1, 0.35, dt);
    env.offline = this._offline;
    env.sun = this.sun;
    env.hour = this.hour;

    this._settleSnow(env, dt);

    // Camera. Eased toward the pointer so it glides rather than snapping, and
    // clamped tight — parallax that travels far enough to notice is parallax
    // that will make someone motion-sick in an hour. When reduced motion is on
    // it eases to zero rather than cutting, so toggling it isn't itself a jolt.
    /* env.motion is 1 or 0, and layers MULTIPLY their drift velocities by it.
       Reduced motion has to reach into the canvas, not just the CSS: the CSS
       toggle stops the panels bobbing, but it does nothing about a sky full of
       drifting cloud, falling rain and full-screen lightning — which is the
       large-area motion that actually causes vestibular trouble, and, in
       lightning's case, is a photosensitivity concern on its own terms.

       With it off, the world becomes a still painting that still BREATHES:
       stars twinkle (an opacity change, not movement), fireflies pulse, the sun
       still crosses the sky over hours. Nothing translates. */
    const m = motion.enabled ? 1 : 0;
    env.motion = m;

    this._cam.x = damp(this._cam.x, -this._mouse.x * MAX_PARALLAX * m, 3.5, dt);
    this._cam.y = damp(this._cam.y, -this._mouse.y * MAX_PARALLAX * 0.5 * m, 3.5, dt);

    // ── The pointer ─────────────────────────────────────────────────────────
    // `moved` decays, so a parked cursor stops disturbing things. A stationary
    // pointer permanently flattening a patch of grass looks like a rendering
    // bug, not like a hand.
    const p = this._pointer;
    p.moved = Math.max(0, p.moved - dt);
    p.vx = damp(p.vx, 0, 6, dt);
    p.vy = damp(p.vy, 0, 6, dt);

    // ── Music energy ────────────────────────────────────────────────────────
    // Reduced motion kills the reactivity entirely: a world that pulses on every
    // kick drum is, by definition, a world in constant motion.
    const reactive = store.get('reactive') && m;
    const e = audio.energy(dt);
    env.bass = reactive ? e.bass : 0;
    env.beat = reactive ? e.beat : false;

    // ── Breath ──────────────────────────────────────────────────────────────
    env.breath = zen.breath;
    env.zen = zen.active;

    // ── Season ──────────────────────────────────────────────────────────────
    // The date does not change quickly. Once every 10 seconds is generous.
    this._seasonClock -= dt;
    if (this._seasonClock <= 0) {
      this._seasonClock = 10;
      env.season = getSeason(new Date(), this.lat, store.get('seasonOverride'));
      env.lat = this.lat;
      env.lon = this.lon;

      if (env.season.key !== this._seasonKey) {
        this._seasonKey = env.season.key;
        bus.emit('season', env.season);
      }
    }

    // The palette is expensive-ish and imperceptible frame to frame. 4Hz.
    this._paletteClock -= dt;
    if (this._paletteClock <= 0) {
      this._paletteClock = 0.25;
      env.pal = getPalette(env.hour, this.weather, env.season, env.breath);
      applyPaletteToDOM(env.pal);

      if (env.pal.key !== this._phaseKey) {
        this._phaseKey = env.pal.key;
        bus.emit('phase', env.pal);
        audio.setAmbience({
          kind: this.weather,
          night: env.pal.night,
          wind: this.wind,
          precip: this.precip,
        });
      }
    }

    /* The bloom's strength is the cheapest place to put the music. Pushing the
       glow canvas's opacity around costs one compositor property — no relayout,
       no repaint, no filter recomputation — so the whole scene can throb with
       the bass at literally zero rendering cost. This is why the reactivity
       lives HERE and not in a pulsing backdrop-filter on thirteen panels. */
    const bloom = 0.85 + env.bass * 0.3 + (env.zen ? (env.breath - 0.5) * 0.25 : 0);
    if (Math.abs(bloom - this._bloom) > 0.01) {
      this._bloom = bloom;
      this.gcv.style.opacity = bloom.toFixed(2);
    }

    // ── Render ──────────────────────────────────────────────────────────────
    const { g, gg, W, H } = { g: this.g, gg: this.gg, W: env.W, H: env.H };

    // The glow buffer must be CLEARED, not painted — its transparent pixels are
    // what let the scene show through the screen blend.
    gg.clearRect(0, 0, W, H);

    for (const l of this.layers) {
      if (!l.enabled) continue;
      l.update(env);
      l.draw(g, env);
    }

    // The cursor's lantern. Drawn last, straight into the emissive buffer, so it
    // lights everything the layers just painted — and it costs one glowDot.
    this._lantern(env);
  }

  /**
   * At night, the pointer casts a warm pool of light into the world. It's the
   * single cheapest piece of magic in the project: one emissive blob, no
   * lighting model, no shadow pass — and because the glow buffer is blurred and
   * screen-blended, the grass and flowers under it genuinely appear to brighten.
   *
   * It fades in with the darkness, so at noon there's nothing (a lantern in
   * daylight is just a smudge) and at midnight it's a proper little lamp.
   */
  _lantern(env) {
    const p = env.pointer;
    if (!p.active) return;

    const dark = clamp(1 - env.pal.lum * 1.6, 0, 1);
    if (dark < 0.08) return;

    const glow = env.glow;
    const r = 26 + env.bass * 10 + (env.zen ? env.breath * 12 : 0);

    glow.globalAlpha = dark * 0.5;
    glowDot(glow, p.x, p.y, r, rgbCss(env.pal.glow), 1);
    glow.globalAlpha = 1;
  }
}
