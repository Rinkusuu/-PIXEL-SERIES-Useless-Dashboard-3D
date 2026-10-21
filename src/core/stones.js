/* ============================================================================
   stones.js — the rules of skipping a stone, for any world with water.

   Whether it skips is the angle of attack: steep digs in, shallow glances
   off. Each contact costs energy, the bounce more than the run, which is why a
   good throw ends in a flurry of rapid touches. Moved here from the classic
   StonesLayer so the 3D shore skips by exactly the same rule; only the units
   differ (scene pixels there, metres here), so the minimum speed is passed in.
   ========================================================================== */

import { bus } from './bus.js';
import { store } from './store.js';
import { unlock } from './achievements.js';
import { clamp } from './util.js';

/* Above this angle of descent the stone digs in instead of glancing off.
   ~14° is roughly right for a real stone. */
export const BITE_ANGLE = 0.25; // radians

/** A fresh stone's character: every stone is a different stone. */
export const stoneCharacter = (rand = Math.random) => ({
  bounce: 0.48 + rand() * 0.14, // how much of the drop it gives back
  drag: 0.79 + rand() * 0.07, // how much forward speed each kiss costs
});

/**
 * The stone has met the water. `s` has { vx, vy (along the water), vh (up),
 * bounce, drag, skips }. Returns 'sink' or 'skip', and on a skip changes the
 * stone's velocity for the next hop.
 */
export function contact(s, minForward) {
  const forward = Math.hypot(s.vx, s.vy);
  const drop = -s.vh;
  const angle = Math.atan2(drop, forward);
  if (angle > BITE_ANGLE || forward < minForward) return 'sink';
  s.vh = drop * s.bounce;
  s.vx *= s.drag;
  s.vy *= s.drag;
  s.skips++;
  bus.emit('splash', clamp(forward / (minForward * 7), 0.08, 0.3));
  if (s.skips >= 3) bus.emit('sfx', 'type');
  return 'skip';
}

/** The throw is over: tally, toast, coins, achievements. */
export function finishThrow(n) {
  const best = store.get('skips') || 0;
  if (n === 0) {
    bus.emit('toast', { icon: '🪨', text: 'Straight down. A rock, technically.' });
  } else if (n > best) {
    store.set('skips', n);
    bus.emit('sfx', 'fanfare');
    bus.emit('toast', { icon: '🪨', text: `${n} skips — a new best.`, ms: 4000 });
  } else {
    bus.emit('toast', { icon: '🪨', text: `${n} skip${n === 1 ? '' : 's'}.` });
  }
  if (n > 0) {
    bus.emit('coins', n * 2);
    unlock('skipper');
    if (n >= 5) unlock('skipper5');
  }
  /* Announced whether or not it worked: failure is an outcome, not an absence of one. */
  bus.emit('skip', { skips: n, best: Math.max(n, best) });
}
