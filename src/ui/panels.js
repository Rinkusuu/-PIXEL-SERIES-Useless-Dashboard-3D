/* ============================================================================
   panels.js — opening the dashboard's panels over the 3D world.

   The fifteen widgets never leave #grid: several of them are what fetch the
   weather, track the station and count the coins, so they must stay mounted.
   Opening one just shows the grid as an overlay with every other panel
   hidden; the pocket book shows all of them. Nothing is moved, rebuilt or
   duplicated, and Classic never calls this.

   Announced on the bus as 'panel' ({ title } or { pocket: true } or null), so
   the world can let go of the mouse and stop walking while you read.
   ========================================================================== */

import { bus } from '../core/bus.js';
import { $ } from '../core/util.js';

const root = document.documentElement;
let current = null;

const panelsIn = () => [...($('#grid')?.children ?? [])];

/** Every panel title, in grid order: for ⌘K and for the objects in the world. */
export const panelTitles = () => panelsIn().map((p) => p.getAttribute('aria-label')).filter(Boolean);

export function openPanel(title) {
  const target = panelsIn().find((p) => p.getAttribute('aria-label') === title);
  if (!target) return false;
  for (const p of panelsIn()) p.toggleAttribute('data-focus', p === target);
  root.dataset.overlay = 'panel';
  current = { title };
  bus.emit('panel', current);
  bus.emit('sfx', 'page');
  // Focus the panel itself, so the keyboard and the screen reader land in it.
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
  return true;
}

export function openPocket() {
  for (const p of panelsIn()) p.removeAttribute('data-focus');
  root.dataset.overlay = 'pocket';
  current = { pocket: true };
  bus.emit('panel', current);
  bus.emit('sfx', 'page');
  $('#grid')?.scrollTo?.(0, 0);
}

export function closePanels() {
  if (!current) return;
  delete root.dataset.overlay;
  current = null;
  bus.emit('panel', null);
}

export const panelOpen = () => current;

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && current) {
    e.preventDefault();
    closePanels();
  }
});

// A tap on the dimmed world around the panel closes it: touch has no Esc.
addEventListener('pointerdown', (e) => {
  if (current && e.target === $('#grid')) closePanels();
});
