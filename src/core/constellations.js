/* ============================================================================
   constellations.js — your constellations, and your wishes, in either world.

   A constellation is a list of star INDICES into the seeded field
   (sky/stars.js), so the same line joins the same two stars in the classic
   sky and the 3D one. This book owns the list: renderers only say which star
   was picked, and draw what is here.

   The panel asks; the book answers. It can't just empty the store itself —
   the book holds `saved`, and a cleared store with a full `saved` would write
   every "forgotten" constellation straight back on the next commit.
   (Moved from classic/layers/StarsLayer.js, unchanged in behaviour.)
   ========================================================================== */

import { bus } from './bus.js';
import { store } from './store.js';
import { unlock } from './achievements.js';

class Book {
  constructor() {
    this.saved = store.get('stars') || [];
    this.drawing = []; // star indices in the line being drawn right now

    bus.on('stars:clear', () => this.clear());
    bus.on('stars:forget', (i) => this.forget(i));
    bus.on('stars:name', ({ index, name }) => this.name(index, name));
  }

  /** A star was picked. The last star again closes the constellation. */
  add(index) {
    if (this.drawing.length && this.drawing[this.drawing.length - 1] === index) return this.commit();
    if (this.drawing.includes(index)) return;
    this.drawing.push(index);
    bus.emit('sfx', this.drawing.length === 1 ? 'pop' : 'type');
  }

  /** Keep it. Two stars is a line, and a line is enough to be a constellation. */
  commit() {
    if (this.drawing.length < 2) {
      this.drawing = [];
      return;
    }
    this.saved = [...this.saved, { pts: this.drawing, at: Date.now(), name: '' }];
    store.set('stars', this.saved);
    this.drawing = [];

    bus.emit('sfx', 'fanfare');
    bus.emit('toast', { icon: '✨', text: 'It is yours now. It will be there tomorrow.', ms: 4500 });
    // `naming` is the panel's cue to offer the input.
    bus.emit('constellation', { count: this.saved.length, index: this.saved.length - 1, naming: true });

    unlock('stargazer');
    if (this.saved.length >= 3) unlock('stargazer3');
  }

  discard() {
    this.drawing = [];
  }

  /** Naming is optional, and staying nameless is a legitimate answer. */
  name(index, name) {
    const c = this.saved[index];
    if (!c) return;
    c.name = String(name).trim().slice(0, 16).trim(); // a cut can land on a space
    store.set('stars', this.saved);
    if (c.name) {
      bus.emit('sfx', 'confirm');
      unlock('namer');
    }
    bus.emit('constellation', { count: this.saved.length });
  }

  /** Forget one. The stars stay; only the line between them goes. */
  forget(index) {
    if (!this.saved[index]) return;
    this.saved = this.saved.filter((_, i) => i !== index);
    store.set('stars', this.saved);
    bus.emit('sfx', 'pop');
    bus.emit('constellation', { count: this.saved.length });
  }

  /** Give the sky back. Irreversible — which is why the panel asks twice. */
  clear() {
    if (!this.saved.length) return;
    this.saved = [];
    this.drawing = [];
    store.set('stars', []);
    bus.emit('sfx', 'page');
    bus.emit('toast', { icon: '✨', text: 'The sky is just stars again.', ms: 4000 });
    bus.emit('constellation', { count: 0 });
  }

  /* A wish, if you were fast enough. The shooting star is not waiting for you:
     it exists for a second and a half and then it is gone forever, and no
     amount of skill makes another one come. The wish costs nothing, grants
     nothing, and cannot be farmed. */
  wish() {
    const n = store.update('wishes', (w) => (w || 0) + 1);
    bus.emit('sfx', 'fanfare');
    bus.emit('toast', { icon: '🌠', text: 'You wished. Nothing will come of it.', ms: 4500 });
    bus.emit('wish', { count: n });
    unlock('wisher');
    return n;
  }
}

export const book = new Book();
