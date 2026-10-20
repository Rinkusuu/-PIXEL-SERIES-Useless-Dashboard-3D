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
import { env as world } from '../core/env.js';
import { glowDot } from '../ui/pixel.js';
import { clamp, damp, rgbCss } from '../core/util.js';

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

    this._mouse = { x: 0, y: 0 };
    this._cam = { x: 0, y: 0 };
    this._bloom = 0.85; // the CSS resting opacity. Unset, the bass never reached the bloom.
    /* The pointer, in SCENE coordinates (chunky logical pixels), not CSS pixels.
       Layers push things away from it, part grass around it, and light a lantern
       under it — all of which need it in the same space they're drawing in. */
    this._pointer = { x: -999, y: -999, vx: 0, vy: 0, active: false, moved: 0 };

    /* The shared world state (core/env.js), plus the four things only a 2D
       canvas renderer needs: its size, the parallax camera, the pointer in
       buffer pixels, and the emissive context. */
    this.env = Object.assign(world.state, {
      W: 0, H: 0,
      parallax: this._cam,
      pointer: this._pointer,
      glow: this.gg,
    });

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

  frame(tick) {
    const env = this.env;
    world.update(tick);
    const { dt } = tick;
    const m = env.motion;

    // Camera. Eased toward the pointer so it glides rather than snapping, and
    // clamped tight — parallax that travels far enough to notice is parallax
    // that will make someone motion-sick in an hour. When reduced motion is on
    // it eases to zero rather than cutting, so toggling it isn't itself a jolt.
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
