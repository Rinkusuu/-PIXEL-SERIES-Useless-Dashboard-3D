/* ============================================================================
   play.js — the four pointless things you can do with your hands.

   Fishing, skipping stones, drawing constellations, catching leaves. All four
   want the same resource — a click on the world — so they cannot all be on at
   once, and this is the one place that says which one is.

   The alternative was four layers each independently deciding whether a click
   "belonged" to them, which is a race with no referee: you'd throw a stone at a
   fish and catch a constellation.

   Nothing here knows HOW to fish. It only knows that you are fishing. The layer
   that owns the water owns the fishing, the layer that owns the stars owns the
   constellations, and the layer that owns the falling leaves owns catching them.
   Each thing is implemented exactly once, where the thing already lives.
   ========================================================================== */

import { bus } from './bus.js';

export const MODES = {
  fish: { icon: '🎣', label: 'Fish', hint: 'cast into the lake, then wait. that is the game.' },
  skip: { icon: '🪨', label: 'Skip stones', hint: 'flat one, low throw, across the water.' },
  stars: { icon: '✨', label: 'Constellations', hint: 'join the stars. name it. it is yours.' },
  leaves: { icon: '🍂', label: 'Catch leaves', hint: 'they have to be falling. autumn helps.' },
};

class Play {
  constructor() {
    this.mode = null;
  }

  set(mode) {
    const next = MODES[mode] ? mode : null;
    if (next === this.mode) return;

    this.mode = next;

    /* The cursor is the only affordance these modes get. There's no HUD, no
       crosshair, no tutorial — the pointer changes and the world is live. */
    if (next) document.documentElement.dataset.play = next;
    else delete document.documentElement.dataset.play;

    bus.emit('play', { mode: next });
  }

  toggle(mode) {
    this.set(this.mode === mode ? null : mode);
  }

  get active() {
    return this.mode !== null;
  }
}

export const play = new Play();
