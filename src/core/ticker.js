/* ============================================================================
   ticker.js — ONE requestAnimationFrame loop for the entire application.

   Every animated thing on this page — the sky, the fireflies, the clock digits,
   the equalizer, the slime — is driven from here. Multiple RAF loops don't run
   in parallel; they just interleave and multiply layout thrash. One loop also
   gives us one place to do the three things that actually keep this at 60fps:

     1. clamp dt   — a background tab returns with a 12-second delta; without a
                     clamp every particle teleports and the sim explodes.
     2. pause      — hidden tab burns zero CPU.
     3. adapt      — if we can't hold the frame budget, shed particles instead
                     of dropping frames. Quality degrades; smoothness doesn't.
   ========================================================================== */

import { bus } from './bus.js';
import { clamp } from './util.js';

const MAX_DT = 1 / 20; // never step more than 50ms of sim in one frame

class Ticker {
  constructor() {
    this.t = 0; // seconds since start (sim time — stops when hidden)
    this.frame = 0;
    this.fps = 60;
    this.running = false;

    /** 0.35 … 1 — how much optional work the scene may do this frame. */
    this.quality = 1;

    this._last = 0;
    this._acc = 0; // wall-clock accumulator for the 1Hz 'second' event
    this._samples = [];
    this._sagFrames = 0;
    this._loop = this._loop.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    requestAnimationFrame(this._loop);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.running = false;
      } else if (!this.running) {
        this.running = true;
        this._last = performance.now(); // discard the gap; do not fast-forward
        requestAnimationFrame(this._loop);
      }
    });
  }

  _loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this._loop);

    const raw = (now - this._last) / 1000;
    this._last = now;
    const dt = clamp(raw, 0, MAX_DT);

    this.t += dt;
    this.frame++;

    this._measure(raw);

    // Wall-clock second — clocks and idle timers listen for this, not for tick.
    this._acc += raw;
    if (this._acc >= 1) {
      this._acc %= 1;
      bus.emit('second', new Date());
    }

    bus.emit('tick', { t: this.t, dt, frame: this.frame, quality: this.quality });
  }

  /**
   * Rolling 30-frame FPS, and an adaptive quality dial.
   *
   * Hysteresis matters: quality is dropped only after 30 consecutive slow
   * frames but recovered slowly. Reacting to a single slow frame makes the
   * particle count oscillate visibly, which looks far worse than being
   * permanently at 0.7.
   */
  _measure(raw) {
    this._samples.push(raw);
    if (this._samples.length > 30) this._samples.shift();

    const mean = this._samples.reduce((a, b) => a + b, 0) / this._samples.length;
    this.fps = mean > 0 ? 1 / mean : 60;

    if (this.fps < 50) {
      this._sagFrames++;
      if (this._sagFrames > 30) {
        this.quality = Math.max(0.35, this.quality - 0.05);
        this._sagFrames = 0;
      }
    } else {
      this._sagFrames = 0;
      if (this.fps > 58 && this.quality < 1) {
        this.quality = Math.min(1, this.quality + 0.004);
      }
    }
  }
}

export const ticker = new Ticker();
