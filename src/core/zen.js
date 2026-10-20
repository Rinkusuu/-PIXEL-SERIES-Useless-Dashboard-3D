/* ============================================================================
   zen.js — the dashboard's final feature is hiding the dashboard.

   Press Zen and every widget fades away. What's left is the world, a slowly
   breathing ring, and one word telling you what to do with your lungs.

   THE BREATH IS 4-7-8. It's a real technique (Andrew Weil's), and the ratios
   matter: the long exhale is what actually engages the parasympathetic
   response. A "breathing guide" that just pulses a circle at a pretty rhythm is
   decoration; this one is the actual pattern, so following it does something.

   THE WORLD BREATHES WITH YOU. This is the part that makes it worth building.
   `breath` (0 = fully exhaled, 1 = fully inhaled) is published into the scene,
   where it lifts the ambient light, swells the wind, and flares the fireflies.
   Inhale and the world brightens with you. Exhale and it settles. You are not
   watching a breathing guide; you are breathing with a place.
   ========================================================================== */

import { bus } from './bus.js';
import { unlock } from './achievements.js';
import { clamp, smoothstep } from './util.js';

/** The 4-7-8 cycle, in seconds. 19 seconds a round. */
const PHASES = [
  { key: 'in', label: 'Breathe in', seconds: 4 },
  { key: 'hold', label: 'Hold', seconds: 7 },
  { key: 'out', label: 'Breathe out', seconds: 8 },
];

const CYCLE = PHASES.reduce((n, p) => n + p.seconds, 0);

class Zen {
  constructor() {
    this.active = false;

    /** 0 = fully exhaled, 1 = fully inhaled. The world reads this. */
    this.breath = 0.5;

    this.phase = PHASES[0];
    this.elapsed = 0; // seconds into the current phase
    this.cycles = 0;
    this._t = 0;

    bus.on('tick', ({ dt }) => this._tick(dt));
  }

  toggle() {
    this.active ? this.stop() : this.start();
  }

  start() {
    if (this.active) return;
    this.active = true;
    this._t = 0;
    this.cycles = 0;
    this.phase = PHASES[0];
    this.elapsed = 0;
    document.documentElement.dataset.zen = 'on';
    bus.emit('zen', { active: true, phase: this.phase, breath: this.breath });
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    delete document.documentElement.dataset.zen;
    bus.emit('zen', { active: false, phase: this.phase, breath: this.breath });
  }

  _tick(dt) {
    if (!this.active) {
      // Ease back to neutral rather than snapping — leaving Zen shouldn't jolt
      // the world's brightness.
      this.breath += (0.5 - this.breath) * (1 - Math.exp(-3 * dt));
      return;
    }

    this._t += dt;
    const inCycle = this._t % CYCLE;

    const round = Math.floor(this._t / CYCLE);
    if (round !== this.cycles) {
      this.cycles = round;
      // A full 19-second round of 4-7-8. Nothing else on the dashboard asks for
      // as much of your time, and nothing else gives as much back.
      if (round >= 1) unlock('zen');
    }

    // Which phase are we in, and how far through it?
    let acc = 0;
    let phase = PHASES[0];
    let f = 0;
    for (const p of PHASES) {
      if (inCycle < acc + p.seconds) {
        phase = p;
        f = (inCycle - acc) / p.seconds;
        break;
      }
      acc += p.seconds;
    }

    if (phase.key !== this.phase.key) {
      this.phase = phase;
      this.elapsed = 0;
      // A soft blip on each transition — you can follow the breath with your
      // eyes closed, which is how most people would rather do it.
      bus.emit('sfx', phase.key === 'out' ? 'sip' : 'hover');
      bus.emit('zen', { active: true, phase, breath: this.breath });
    }
    this.elapsed = inCycle - acc;

    /* The curve matters more than the numbers. A linear inhale feels mechanical;
       real breath eases in and eases out at the turnaround. smoothstep on the
       in/out phases gives that, and HOLD is held perfectly flat at 1 — which is
       the whole point of a hold. */
    if (phase.key === 'in') this.breath = smoothstep(f);
    else if (phase.key === 'hold') this.breath = 1;
    else this.breath = 1 - smoothstep(f);

    this.breath = clamp(this.breath, 0, 1);
  }

  /** Seconds left in the current phase — the countdown ring reads this. */
  get remaining() {
    return Math.max(0, this.phase.seconds - this.elapsed);
  }

  /** 0–1 through the current phase. */
  get phaseProgress() {
    return clamp(this.elapsed / this.phase.seconds, 0, 1);
  }
}

export const zen = new Zen();
export { PHASES, CYCLE };
