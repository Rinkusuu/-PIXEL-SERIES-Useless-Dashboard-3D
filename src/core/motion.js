/* ============================================================================
   motion.js — the single authority on whether the world is allowed to move.

   Reduced motion is not a checkbox we tick for the audit. Someone with a
   vestibular disorder can be made genuinely unwell by a parallax camera and a
   sky full of drifting particles. So:

     · the OS preference is honoured by default, and it wins on first paint;
     · the user can still override it in either direction from the topbar,
       because "the OS says reduce, but I want the fireflies" is a real and
       legitimate position, and so is the reverse;
     · the choice persists.

   When motion is off, the scene does NOT freeze into a still image — that would
   be lifeless. It keeps its slow, non-vestibular ambience (fireflies still
   pulse, the sun still crosses the sky over hours) and drops the things that
   actually cause trouble: the parallax camera, the panel float, fast particles.
   ========================================================================== */

import { bus } from './bus.js';
import { store } from './store.js';

const query = matchMedia('(prefers-reduced-motion: reduce)');

class Motion {
  constructor() {
    this.osPrefersReduced = query.matches;
    this._apply();

    // If the user hasn't overridden, follow the OS live.
    query.addEventListener('change', (e) => {
      this.osPrefersReduced = e.matches;
      if (store.get('motion') === null) this._apply();
    });
  }

  /** The resolved answer. Read this; it's a plain boolean, free to poll. */
  get enabled() {
    const override = store.get('motion');
    return override === null ? !this.osPrefersReduced : override;
  }

  /** null = follow the OS. */
  set(value) {
    store.set('motion', value);
    this._apply();
  }

  toggle() {
    this.set(!this.enabled);
  }

  _apply() {
    const on = this.enabled;
    // The data attribute drives the --motion token, which every decorative
    // animation in the CSS multiplies its duration and distance by.
    document.documentElement.dataset.motion = on ? 'on' : 'off';
    bus.emit('motion', on);
  }
}

export const motion = new Motion();
