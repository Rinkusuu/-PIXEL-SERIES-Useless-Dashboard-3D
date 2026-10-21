/* ============================================================================
   PlayWidget — "Idle Hands".

   Four things to do, none of which achieve anything. The panel is deliberately
   thin: it picks the mode, shows the tallies, and then gets out of the way,
   because the games do not happen in here. They happen out THERE, in the world,
   and a panel that tried to host them would just be a small window in front of a
   large one.

   So this is a remote control for the landscape.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { store } from '../core/store.js';
import { el } from '../core/util.js';
import { play, MODES } from '../core/play.js';
import { FISH } from '../core/fishing.js';

const FISH_BY_ID = new Map(FISH.map((f) => [f.id, f]));

export class PlayWidget extends Widget {
  constructor() {
    super({ title: 'Idle Hands', span: 'span-2', icon: '🎣', className: 'w-play' });
    this.buttons = new Map();
    this._armed = false; // the wipe button is a two-click button
  }

  body() {
    this.modes = el('div.play__modes', { role: 'group', 'aria-label': 'Something to do' });

    for (const [key, m] of Object.entries(MODES)) {
      const node = el('button.play__mode', {
        type: 'button',
        title: m.hint,
        'aria-pressed': 'false',
        onclick: () => {
          play.toggle(key);
          bus.emit('sfx', 'confirm');
        },
        onpointerenter: () => bus.emit('sfx', 'hover'),
      }, [
        el('span.play__ico', { text: m.icon, 'aria-hidden': 'true' }),
        el('span.play__label', { text: m.label }),
      ]);

      this.buttons.set(key, node);
      this.modes.append(node);
    }

    this.hint = el('p.play__hint', { text: 'pick one. none of them will help.' });
    this.tally = el('div.play__tally');

    this.listen('play', ({ mode }) => this._sync(mode));

    // Any of the games finishing is a reason to redraw the numbers.
    for (const ev of ['fish', 'skip', 'leaf', 'wish']) {
      this.listen(ev, () => this._tally());
    }

    /* The sky tells us when it has just taken a new constellation, and asks us
       to get it named. We are the only UI left on screen in play mode, so the
       asking has to happen here. */
    this.listen('constellation', (e) => {
      this._naming = e?.naming ? e.index : null;
      this._tally();
    });

    this._tally();

    return el('div.play', {}, [this.modes, this.hint, el('div.divider'), this.tally]);
  }

  _sync(mode) {
    for (const [key, node] of this.buttons) {
      const on = key === mode;
      node.setAttribute('aria-pressed', String(on));
      node.classList.toggle('is-on', on);
    }
    /* With a mode on, every other panel has faded away and this one is a dock in
       the corner. So this line is now the ONLY thing on screen telling you how to
       get back — it has to carry the way out, not just the flavour text. */
    this.hint.textContent = mode
      ? `${MODES[mode].hint}  ·  esc to stop`
      : 'pick one. none of them will help.';
  }

  _tally() {
    // Every rebuild disarms the wipe: a button that came back from a redraw
    // still holding "yes, delete" is a trap.
    clearTimeout(this._disarm);
    this._armed = false;

    const catches = store.get('catches') || [];
    const skips = store.get('skips') || 0;
    const leaves = store.get('leaves') || 0;
    const wishes = store.get('wishes') || 0;
    const sky = store.get('stars') || [];

    const stat = (k, v) =>
      el('div.stat', {}, [el('span.stat__k', { text: k }), el('span.stat__v', { text: String(v) })]);

    // What you caught last. The only trophy this app will ever give you.
    const last = catches.length ? FISH_BY_ID.get(catches[catches.length - 1]) : null;

    this.tally.replaceChildren(
      stat('Caught', catches.length),
      stat('Best skip', skips || '—'),
      stat('Leaves', leaves),
      stat('Wishes', wishes),
      el('div.play__last', {}, [
        el('span.play__last-k', { text: 'Last catch' }),
        el('span.play__last-v', { text: last ? `${last.icon} ${last.name}` : 'nothing yet' }),
      ]),
      // Nothing up there yet, nothing to show.
      ...(sky.length ? [this._sky(sky), this._wipe()] : [])
    );

    // A field that isn't focused is a field nobody will type in.
    if (this._naming != null) this.tally.querySelector('.sky__field')?.focus();
  }

  /* Your sky, as a list. It replaced a bare "Constellations: 3" counter, which
     told you that you owned three things but not which three — and a collection
     you cannot look at is just a number. */
  _sky(list) {
    return el(
      'div.play__sky',
      { role: 'list', 'aria-label': 'Your constellations' },
      list.map((c, i) => (i === this._naming ? this._field(i, c) : this._row(c, i)))
    );
  }

  _row(c, i) {
    return el('div.sky__row', { role: 'listitem' }, [
      // The name is a button: click it to name the nameless, or rename the rest.
      el(c.name ? 'button.sky__name' : 'button.sky__name.is-blank', {
        type: 'button',
        text: c.name || 'unnamed',
        title: c.name ? 'Rename it' : 'Name it',
        onclick: () => {
          this._naming = i;
          this._tally();
        },
      }),
      el('button.sky__forget', {
        type: 'button',
        text: '×',
        'aria-label': `Forget ${c.name || 'this constellation'}`,
        title: 'Forget this one',
        onclick: () => bus.emit('stars:forget', i),
      }),
    ]);
  }

  /* Naming, in the only place there is room for it. Escape must not bubble: the
     app treats a loose Escape as "stop playing", and abandoning a name is not
     the same as putting the stars down. */
  _field(i, c) {
    const done = (name) => {
      if (this._naming !== i) return; // already resolved; a late blur, ignore it
      this._naming = null;
      bus.emit('stars:name', { index: i, name });
    };

    return el('input.sky__field', {
      type: 'text',
      value: c.name || '',
      maxlength: 16,
      placeholder: "name it. or don't.",
      'aria-label': 'Name this constellation',
      onkeydown: (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') done(e.target.value);
        if (e.key === 'Escape') {
          this._naming = null;
          this._tally();
        }
      },
      onblur: (e) => done(e.target.value),
    });
  }

  /* The only destructive thing this panel can do, and there is no undo — so it
     asks twice, and forgets it asked after a few seconds. The wipe itself is
     the sky's business: this only says please. */
  _wipe() {
    const btn = el('button.play__wipe', {
      type: 'button',
      text: 'Forget them all',
      onclick: () => {
        if (this._armed) return bus.emit('stars:clear');

        this._armed = true;
        btn.classList.add('is-armed');
        btn.textContent = 'Sure? there is no undo';
        bus.emit('sfx', 'click');
        this._disarm = setTimeout(() => this._tally(), 4000);
      },
      onpointerenter: () => bus.emit('sfx', 'hover'),
    });

    return btn;
  }

  mounted() {
    this._sync(play.mode);
  }
}
