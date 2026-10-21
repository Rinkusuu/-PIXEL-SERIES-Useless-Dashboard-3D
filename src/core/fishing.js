/* ============================================================================
   fishing.js — the rules of fishing, for any world that has a lake.

   THE BITE IS A POISSON PROCESS. There is no timer counting down to a
   guaranteed fish: at every instant there is a fixed small chance of a bite,
   so the wait is memoryless. A long wait tells you nothing about how much
   longer you'll wait, and you cannot get better at predicting it. Real fishing
   has exactly this property and it is the only reason it is relaxing rather
   than infuriating. (Moved here from the classic FishingLayer so the 3D dock
   bites exactly the same way.)
   ========================================================================== */

import { bus } from './bus.js';
import { store } from './store.js';
import { unlock } from './achievements.js';

/* The catch table. Weighted, and the weights move with the world: you will not
   pull a sunfish out of a frozen lake at 3am. */
export const FISH = [
  { id: 'minnow',   icon: '🐟', name: 'Minnow',          coins: 2,  w: 30 },
  { id: 'perch',    icon: '🐠', name: 'Perch',           coins: 5,  w: 22 },
  { id: 'carp',     icon: '🐡', name: 'Startled Carp',   coins: 9,  w: 14 },
  { id: 'eel',      icon: '🦑', name: 'Something Long',  coins: 14, w: 7, night: true },
  { id: 'boot',     icon: '🥾', name: 'A Boot',          coins: 1,  w: 12 },
  { id: 'can',      icon: '🥫', name: 'Rusted Tin',      coins: 1,  w: 8 },
  { id: 'moon',     icon: '🌙', name: "The Moon's Reflection", coins: 25, w: 2, night: true },
  { id: 'star',     icon: '⭐', name: 'A Fallen Star',   coins: 40, w: 1, night: true },
];

export const CAST_TIME = 0.45; // seconds the line is in the air (classic)
export const BITE_WINDOW = 1.1; // how long you have to strike
export const MEAN_WAIT = 9; // seconds; the Poisson rate is 1/this

/** Did a fish bite in this frame? Fresh every frame — never a countdown. */
export const bites = (dt, rand = Math.random) => rand() < dt / MEAN_WAIT;

/** You struck in time: roll the table (night-only fish only at night). */
export function rollCatch(night, rand = Math.random) {
  const pool = FISH.filter((f) => !f.night || night);
  const total = pool.reduce((n, f) => n + f.w, 0);
  let roll = rand() * total;
  for (const f of pool) {
    roll -= f.w;
    if (roll <= 0) return f;
  }
  return pool[0];
}

/** Keep it: the store, the coins, the toast, the achievements. */
export function landCatch(caught) {
  const catches = [...store.get('catches'), caught.id];
  store.set('catches', catches);

  bus.emit('sfx', caught.coins > 20 ? 'fanfare' : 'coin');
  bus.emit('coins', caught.coins);
  bus.emit('toast', { icon: caught.icon, text: `${caught.name} — ${caught.coins} coins`, ms: 4000 });
  bus.emit('fish', { fish: caught, total: catches.length });

  unlock('angler');
  if (catches.length >= 10) unlock('angler10');
  if (caught.id === 'boot') unlock('boot');
  return catches.length;
}

export function lostCatch() {
  bus.emit('toast', { icon: '💨', text: 'It got away. There will be others.' });
}
