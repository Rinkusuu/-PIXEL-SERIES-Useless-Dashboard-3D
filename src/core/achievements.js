/* ============================================================================
   achievements.js — tiny, useless, and the most-loved feature in any cosy game.

   Every one of these is deliberately unearned. You get "Certified Idle" for
   leaving the tab open, not for doing anything. That's the joke, and it's also
   the thesis: the dashboard rewards you for being here, not for producing.
   ========================================================================== */

import { bus } from './bus.js';
import { store } from './store.js';

export const ACHIEVEMENTS = [
  { id: 'arrive',    icon: '🌱', title: 'You Made It',        hint: 'Open the dashboard.' },
  { id: 'idle5',     icon: '🛋️', title: 'Certified Idle',      hint: 'Stay for five minutes. Do nothing.' },
  { id: 'idle30',    icon: '🧘', title: 'Professionally Still', hint: 'Half an hour of magnificent nothing.' },
  { id: 'quotes10',  icon: '📜', title: 'Wisdom Enjoyer',      hint: 'Read ten quotes.' },
  { id: 'coffee5',   icon: '☕', title: 'Adequately Caffeinated', hint: 'Five coffees. Reported, not consumed.' },
  { id: 'coffee20',  icon: '🫨', title: 'Vibrating Gently',    hint: 'Twenty coffees. Please stop.' },
  { id: 'petfed',    icon: '🍬', title: 'Slime Whisperer',     hint: 'Feed the slime.' },
  { id: 'petfed10',  icon: '💚', title: 'Best Friend',         hint: 'Feed the slime ten times.' },
  { id: 'music',     icon: '🎵', title: 'Vibe Curator',        hint: 'Play something.' },
  { id: 'night',     icon: '🌙', title: 'Night Owl',           hint: 'Be here after midnight.' },
  { id: 'dawn',      icon: '🌅', title: 'Saw The Sunrise',     hint: 'Be here at dawn.' },
  { id: 'storm',     icon: '⛈️', title: 'Weathered It',        hint: 'Watch a thunderstorm.' },
  { id: 'coins100',  icon: '🪙', title: 'Idle Rich',           hint: 'Accumulate 100 coins doing nothing.' },
  { id: 'clicky',    icon: '🖱️', title: 'Restless Hands',      hint: 'Click a hundred things.' },
  { id: 'collector', icon: '🎒', title: 'Curator of Junk',     hint: 'Find every item.' },
  { id: 'iss',       icon: '🛰️', title: 'Look Up',              hint: 'Be here when the station is genuinely visible overhead.' },
  { id: 'zen',       icon: '🧘', title: 'One Full Breath',      hint: 'Finish a round of 4-7-8 breathing.' },
  { id: 'seasons',   icon: '🍂', title: 'Turn of the Year',     hint: 'See all four seasons.' },
  { id: 'postcard',  icon: '📮', title: 'Wish You Were Here',   hint: 'Send a postcard from a place that does not exist.' },

  // Idle hands.
  { id: 'angler',       icon: '🎣', title: 'Gone Fishing',      hint: 'Catch anything at all.' },
  { id: 'angler10',     icon: '🐟', title: 'Serious Angler',    hint: 'Catch ten things. Some were fish.' },
  { id: 'boot',         icon: '🥾', title: 'Sole Survivor',     hint: 'Catch a boot. It happens.' },
  { id: 'skipper',      icon: '🪨', title: 'Plop',              hint: 'Skip a stone. Once.' },
  { id: 'skipper5',     icon: '💫', title: 'Five Bounces',      hint: 'Skip a stone five times. Throw flatter.' },
  { id: 'stargazer',    icon: '✨', title: 'Join The Dots',     hint: 'Draw a constellation of your own.' },
  { id: 'stargazer3',   icon: '🌌', title: 'Cartographer',      hint: 'Draw three. Name none of them.' },
  { id: 'namer',        icon: '🏷️', title: 'Named It',           hint: 'Give a constellation a name. Ignore the previous advice.' },
  { id: 'wisher',       icon: '🌠', title: 'Made A Wish',        hint: 'Catch a shooting star before it goes. It will not help.' },
  { id: 'leafcatcher',  icon: '🍂', title: 'Caught One',        hint: 'Catch a falling leaf.' },
  { id: 'leafcatcher25',icon: '🍁', title: 'Autumn Person',     hint: 'Catch twenty-five. It was going to land anyway.' },

  // Offline.
  { id: 'offgrid',      icon: '📴', title: 'Off The Grid',      hint: 'Use the dashboard with no network at all.' },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/**
 * Unlock. Idempotent — calling it every frame is safe and is in fact how most
 * of the "be here at dawn" style conditions are checked.
 */
export function unlock(id) {
  const a = BY_ID.get(id);
  if (!a) return false;

  const owned = store.get('achievements');
  if (owned.includes(id)) return false;

  store.set('achievements', [...owned, id]);

  bus.emit('toast', { icon: a.icon, text: `Achievement: ${a.title}` });
  bus.emit('sfx', 'fanfare');
  bus.emit('achievement', a);
  return true;
}

export const has = (id) => store.get('achievements').includes(id);
export const owned = () => store.get('achievements');
export const progress = () => ({
  count: store.get('achievements').length,
  total: ACHIEVEMENTS.length,
});

/* ── Ambient unlock conditions ────────────────────────────────────────────────
   The ones that aren't tied to a specific widget's interaction live here, so no
   widget has to remember to check them.
   -------------------------------------------------------------------------- */

let clicks = 0;
let seconds = 0;

export function initAchievements() {
  unlock('arrive');

  addEventListener('pointerdown', () => {
    if (++clicks >= 100) unlock('clicky');
  }, { passive: true });

  bus.on('second', (d) => {
    seconds++;
    if (seconds === 300) unlock('idle5');
    if (seconds === 1800) unlock('idle30');

    const h = d.getHours();
    if (h >= 0 && h < 4) unlock('night');
    if (h >= 5 && h < 7) unlock('dawn');
  });

  bus.on('weather', (w) => {
    if (w.kind === 'storm') unlock('storm');
  });

  // The network went away and you stayed. The world still worked.
  bus.on('net', ({ online }) => {
    if (!online) unlock('offgrid');
  });

  /* "Turn of the Year" is the only achievement here that can't be earned in one
     sitting honestly — so it accumulates across visits. Forcing the seasons from
     the palette counts, and that's deliberate: the point is to have LOOKED at all
     four, not to have waited twelve months for them. */
  bus.on('season', (s) => {
    const seen = new Set(store.get('seasonsSeen') || []);
    seen.add(s.key);
    store.set('seasonsSeen', [...seen]);
    if (seen.size >= 4) unlock('seasons');
  });

}
