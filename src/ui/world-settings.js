/* ============================================================================
   world-settings.js — comfort options for the walkable world.

   Field of view, head bob (off by default), snap turn, pointer lock, quality,
   and the way back to the classic dashboard. One glass panel, opened from the
   topbar or ⌘K. Every change is stored in `view` and announced as 'view', so
   the world applies it on the next frame.
   ========================================================================== */

import { bus } from '../core/bus.js';
import { store } from '../core/store.js';
import { el } from '../core/util.js';
import { button } from './feedback.js';

export function initWorldSettings({ switchMode }) {
  const set = (patch) => {
    store.set('view', { ...store.get('view'), ...patch });
    bus.emit('view', store.get('view'));
  };

  const fovOut = el('output.wset__val');
  const fov = el('input.wset__range', {
    type: 'range', min: 55, max: 100, step: 5, 'aria-label': 'Field of view',
    oninput: () => {
      fovOut.textContent = `${fov.value}°`;
      set({ fov: Number(fov.value) });
    },
  });

  const toggle = (key, label) => {
    const b = button({ label, onClick: () => { set({ [key]: !store.get('view')[key] }); sync(); } });
    b.dataset.key = key;
    return b;
  };
  const toggles = [toggle('headBob', 'Head bob'), toggle('snapTurn', 'Snap turn'), toggle('pointerLock', 'Lock mouse')];

  const tiers = ['auto', 'low', 'medium', 'high'].map((q) => {
    const b = button({ label: q, onClick: () => { set({ quality: q }); sync(); } });
    b.dataset.q = q;
    return b;
  });

  const close = () => (root.hidden = true);
  const root = el('section.panel.wset', { hidden: true, role: 'dialog', 'aria-label': 'World settings' }, [
    el('header.panel__head', {}, [el('span.panel__spark'), el('h2.panel__title', { text: 'World' })]),
    el('div.panel__body', {}, [
      el('label.wset__row', {}, [el('span', { text: 'Field of view' }), fov, fovOut]),
      el('div.wset__row', { role: 'group', 'aria-label': 'Comfort' }, toggles),
      el('div.wset__row', { role: 'group', 'aria-label': 'Quality' }, [el('span', { text: 'Quality' }), ...tiers]),
      el('div.wset__row', {}, [
        button({ label: 'Classic dashboard', onClick: () => switchMode('classic') }),
        button({ label: 'Close', onClick: close }),
      ]),
    ]),
  ]);
  document.body.append(root);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.hidden) close();
  });

  function sync() {
    const v = store.get('view');
    fov.value = v.fov;
    fovOut.textContent = `${v.fov}°`;
    for (const b of toggles) b.setAttribute('aria-pressed', String(Boolean(v[b.dataset.key])));
    for (const b of tiers) b.setAttribute('aria-pressed', String(v.quality === b.dataset.q));
  }
  sync();

  return {
    toggle() {
      root.hidden = !root.hidden;
      if (!root.hidden) {
        if (document.pointerLockElement) document.exitPointerLock();
        sync();
        fov.focus();
      }
    },
  };
}
