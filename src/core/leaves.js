/* ============================================================================
   leaves.js — what catching a falling leaf does. It was going to land anyway.
   Shared by the classic critters and the 3D leaf tree.
   ========================================================================== */

import { bus } from './bus.js';
import { store } from './store.js';
import { unlock } from './achievements.js';

export function catchLeaf() {
  const n = (store.get('leaves') || 0) + 1;
  store.set('leaves', n);

  bus.emit('sfx', 'pop');
  bus.emit('coins', 1);
  bus.emit('leaf', { total: n });

  unlock('leafcatcher');
  if (n >= 25) unlock('leafcatcher25');

  // Only say something on the round numbers. A toast per leaf would be a punishment for playing.
  if (n === 1) bus.emit('toast', { icon: '🍂', text: 'Caught one. It was going to land anyway.' });
  else if (n % 25 === 0) bus.emit('toast', { icon: '🍂', text: `${n} leaves. None of them needed catching.` });
  return n;
}
