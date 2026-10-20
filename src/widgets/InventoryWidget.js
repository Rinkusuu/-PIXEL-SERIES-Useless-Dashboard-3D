/* ============================================================================
   InventoryWidget — a pixel inventory grid, in the RPG tradition: mostly empty,
   full of junk, and inexplicably compelling.

   Items are FOUND over time. Every so often (and when you interact with things)
   something turns up in the grid with a little pop. Nothing can be used. There
   is no crafting. The slots are the reward.

   Every icon is drawn from ASCII art defined right here — 12×12 sprites, baked
   once at 2× on mount.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { store } from '../core/store.js';
import { el, pick, rng } from '../core/util.js';
import { makeSprite } from '../scene/pixel.js';
import { unlock } from '../core/achievements.js';

const P = {
  k: '#2a2140', w: '#ffffff', y: '#ffd479', o: '#e08a3c', r: '#e05a6a',
  g: '#6fd07a', b: '#6aa8e0', p: '#c89bff', n: '#8a6a52', s: '#c9cfe0',
  d: '#4a3a6a', t: '#3f7f4a',
};

/** 12×12 ASCII sprites. '.' is transparent. */
const ITEMS = [
  { id: 'acorn', name: 'Acorn', blurb: 'Found under the big tree. Warm.', art: [
    '....nnnn....', '...nnnnnn...', '..nnnnnnnn..', '..nn....nn..',
    '..oooooooo..', '.oooooooooo.', '.oooooooooo.', '.oooooooooo.',
    '..oooooooo..', '..oooooooo..', '...oooooo...', '....oooo....',
  ]},
  { id: 'pebble', name: 'Smooth Pebble', blurb: 'Perfectly, uselessly smooth.', art: [
    '............', '....ssss....', '..ssssssss..', '.ssswsssss..',
    '.sswwsssss..', 'sssssssssss.', 'sssssssssss.', '.ssssssssss.',
    '..ssssssss..', '...ssssss...', '............', '............',
  ]},
  { id: 'feather', name: 'Blue Feather', blurb: 'A bird will not miss it.', art: [
    '.........b..', '........bb..', '.......bbb..', '......bbbb..',
    '.....bbbbb..', '....bbbbb...', '...bbbbb....', '..bbbbb.....',
    '..bbbb......', '..bbb.......', '..bb........', '..b.........',
  ]},
  { id: 'berry', name: 'Odd Berry', blurb: 'Do not eat it. Probably.', art: [
    '.....tt.....', '....tt......', '...rrrr.....', '..rrrrrr....',
    '.rrrrrrrr...', '.rrwrrrrr...', '.rrrrrrrr...', '.rrrrrrrr...',
    '..rrrrrr....', '...rrrr.....', '............', '............',
  ]},
  { id: 'shard', name: 'Glass Shard', blurb: 'Catches the light. Sharp.', art: [
    '......p.....', '.....pp.....', '....ppp.....', '...pppp.....',
    '..ppwppp....', '..pppppp....', '..pppppp....', '...ppppp....',
    '...pppp.....', '....ppp.....', '.....pp.....', '......p.....',
  ]},
  { id: 'key', name: 'Small Key', blurb: 'Opens nothing you own.', art: [
    '..yyyy......', '.yy..yy.....', '.y....y.....', '.yy..yy.....',
    '..yyyy......', '...yy.......', '...yy.......', '...yy.......',
    '...yyy......', '...yy.......', '...yyy......', '............',
  ]},
  { id: 'mushroom', name: 'Red Cap', blurb: 'Almost certainly fine.', art: [
    '...rrrrrr...', '..rrwrrrwr..', '.rrrrrrrrrr.', 'rrrrrwrrrrrr',
    'rrrrrrrrrrrr', '.rrrrrrrrrr.', '...wwwwww...', '...ww..ww...',
    '...ww..ww...', '...wwwwww...', '....wwww....', '............',
  ]},
  { id: 'coin', name: 'Old Coin', blurb: 'The face has worn away.', art: [
    '....yyyy....', '..yyyyyyyy..', '.yyyoooyyyy.', '.yyoooooyyy.',
    'yyoooooooyy.', 'yyooowooooy.', 'yyoooooooyy.', '.yyoooooyyy.',
    '.yyyoooyyyy.', '..yyyyyyyy..', '....yyyy....', '............',
  ]},
  { id: 'leaf', name: 'Perfect Leaf', blurb: 'Symmetrical. Suspiciously so.', art: [
    '......t.....', '.....ttt....', '....ggtgg...', '...gggtggg..',
    '..ggggtgggg.', '.gggggtggggg', '..ggggtgggg.', '...gggtggg..',
    '....ggtgg...', '.....gtg....', '......t.....', '......t.....',
  ]},
  { id: 'star', name: 'Fallen Star', blurb: 'Still slightly warm.', art: [
    '.....ww.....', '.....yy.....', '....yyyy....', '.yyyyyyyyyy.',
    '..yyyyyyyy..', '...yyyyyy...', '...yywwyy...', '..yyy..yyy..',
    '.yyy....yyy.', '.yy......yy.', '............', '............',
  ]},
  { id: 'snail', name: 'Patient Snail', blurb: 'It is not in a hurry. Learn.', art: [
    '............', '..k......k..', '..k......k..', '..kk....kk..',
    '...nnnnnn...', '..nddddddn..', '.ndd.ddd.dn.', '.nd.d.d.d.dn',
    '.ndd.d.d.dn.', '..nddddddn..', 'kkknnnnnnkkk', '............',
  ]},
  { id: 'lantern', name: 'Tiny Lantern', blurb: 'Lit. By what, unclear.', art: [
    '.....kk.....', '....kkkk....', '...kssssk...', '..kssyyssk..',
    '..ksyyyysk..', '..ksywwysk..', '..ksyyyysk..', '..kssyyssk..',
    '...kssssk...', '...kkkkkk...', '....kkkk....', '............',
  ]},
];

const SLOTS = 12;
const FIND_INTERVAL = 45; // seconds of existing before something turns up

export class InventoryWidget extends Widget {
  constructor() {
    super({ title: 'Pockets', span: 'span-2', icon: '🎒', className: 'w-inv' });
    this._timer = FIND_INTERVAL;
  }

  body() {
    /* Baked to data URLs, NOT kept as <canvas> elements.
       `canvas.cloneNode(true)` copies the element and leaves the bitmap behind —
       the clone is a correctly-sized, completely blank canvas, which is exactly
       what every filled slot used to render. An <img> carries its pixels with
       it, so cloning one actually clones the picture. Baked once at 4× so the
       12×12 art stays crisp at any slot size. */
    this.sprites = new Map(
      ITEMS.map((it) => [it.id, makeSprite(it.art, P, 4).toDataURL()])
    );

    this.grid = el('div.inv__grid', { role: 'list' });
    this.blurb = el('p.inv__blurb', { text: 'things accumulate. they always do.' });
    this.count = el('span.inv__count');

    this._render();

    return el('div.inv', {}, [this.grid, el('div.inv__foot', {}, [this.count, this.blurb])]);
  }

  _render() {
    const found = store.get('inventory');
    this.grid.replaceChildren();

    for (let i = 0; i < SLOTS; i++) {
      const id = found[i];
      const item = ITEMS.find((x) => x.id === id);

      const slot = el('div.inv__slot', {
        role: 'listitem',
        tabindex: item ? '0' : '-1',
        'aria-label': item ? `${item.name}. ${item.blurb}` : 'Empty slot',
        title: item ? item.name : 'Empty',
      });

      if (item) {
        slot.classList.add('is-full');
        slot.append(
          el('img.inv__sprite', {
            src: this.sprites.get(item.id),
            alt: '', // the slot already carries the name in its aria-label
            draggable: 'false',
          })
        );
        const show = () => {
          this.blurb.textContent = `${item.name} — ${item.blurb}`;
          bus.emit('sfx', 'hover');
        };
        slot.addEventListener('pointerenter', show);
        slot.addEventListener('focus', show);
      }

      this.grid.append(slot);
    }

    this.count.textContent = `${found.length} / ${ITEMS.length}`;
    if (found.length >= ITEMS.length) unlock('collector');
  }

  /** Find a new item, if there's anything left to find and room to put it. */
  _find() {
    const found = store.get('inventory');
    const missing = ITEMS.filter((i) => !found.includes(i.id));
    if (missing.length === 0 || found.length >= SLOTS) return;

    const item = pick(missing);
    store.set('inventory', [...found, item.id]);
    this._render();

    // Pop the new slot.
    const slot = this.grid.children[found.length];
    slot?.classList.add('is-new');

    bus.emit('toast', { icon: '🎒', text: `Found: ${item.name}` });
    bus.emit('sfx', 'confirm');
    bus.emit('coins', 3);
    this.blurb.textContent = `${item.name} — ${item.blurb}`;
  }

  tick({ dt }) {
    this._timer -= dt;
    if (this._timer <= 0) {
      this._timer = FIND_INTERVAL * (0.7 + Math.random() * 0.8);
      this._find();
    }
  }
}
