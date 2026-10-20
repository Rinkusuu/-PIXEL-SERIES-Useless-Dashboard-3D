/* ============================================================================
   QuoteWidget — an RPG dialogue box, complete with an NPC who blinks at you.

   The typewriter is the whole widget, and there are exactly three things that
   separate a good one from a bad one:

     1. It types on a TIMER, not per animation frame. At 144Hz a per-frame
        typewriter types 2.4× faster than at 60Hz.
     2. Punctuation gets extra dwell. A comma is a short breath, a full stop is
        a long one. Uniform character timing sounds like a printer; varied timing
        sounds like someone speaking.
     3. Clicking mid-type SKIPS to the end rather than being ignored. Every RPG
        does this and it's the difference between charming and infuriating.

   The ▼ "continue" arrow only appears once the line is fully typed — the same
   contract Zelda and Stardew use, and it's understood without instruction.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { el } from '../core/util.js';
import { button } from '../ui/feedback.js';
import { getQuote } from '../services/quotes.js';
import { unlock } from '../core/achievements.js';
import { makeSprite } from '../scene/pixel.js';

/* The NPC. A little hooded traveller, authored as ASCII right here in the
   source. Two frames: eyes open, eyes shut. */
const NPC_PALETTE = {
  o: '#2a2140', // outline
  h: '#7a5cc4', // hood
  H: '#9b7ce0', // hood highlight
  s: '#f2c9a0', // skin
  S: '#ffe0c0', // skin highlight
  e: '#2a2140', // eye
  m: '#c86a7a', // mouth
  c: '#4a3a6a', // cloak
};

const NPC_OPEN = [
  '....oooooo....',
  '..ooHHHHHHoo..',
  '.oHHHHHHHHHHo.',
  '.oHhhhhhhhhHo.',
  'ohhssssssssHho',
  'ohhsSSSSSSshho',
  'ohsSsssssssSho',
  'ohsSeSssSeSSho',
  'ohsSSssssSSSho',
  'ohsSSsmmssSSho',
  '.ohsSsmmsSSho.',
  '..ohssssssho..',
  '...occccco....',
  '..occcccccco..',
  '.occcccccccco.',
  'occccccccccccc',
];

const NPC_BLINK = NPC_OPEN.map((row, i) =>
  i === 7 ? 'ohsSSSssSSSSho' : row // eyes closed: the eye row becomes skin
);

export class QuoteWidget extends Widget {
  constructor() {
    super({ title: 'Words of Someone', span: 'span-2', icon: '💬', className: 'w-quote' });

    this.full = '';
    this.shown = 0;
    this.typing = false;
    this._timer = 0;
    this._blinkTimer = 0;
    this.read = 0;
  }

  body() {
    // Bake both NPC frames at 3× so they're crisp at any panel size.
    this.faceOpen = makeSprite(NPC_OPEN, NPC_PALETTE, 3);
    this.faceBlink = makeSprite(NPC_BLINK, NPC_PALETTE, 3);

    this.avatar = el('div.npc', { 'aria-hidden': 'true' });
    this.avatar.append(this.faceOpen);

    this.text = el('p.dlg__text');
    this.author = el('p.dlg__author');
    this.arrow = el('span.dlg__arrow', { text: '▼', 'aria-hidden': 'true' });

    this.box = el('div.dlg', {
      role: 'button',
      tabindex: '0',
      'aria-label': 'Dialogue box. Click for the next quote.',
      onclick: () => this._advance(),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._advance();
        }
      },
    }, [this.text, this.author, this.arrow]);

    this.addTool(
      button({
        label: 'Next',
        sfx: 'page',
        onClick: () => this._advance(),
      })
    );

    // The command palette can ask for a new quote without knowing we exist.
    this.listen('cmd:quote', () => this._advance());

    this.next(true);

    return el('div.quote', {}, [
      el('div.npc__frame', {}, [this.avatar, el('span.npc__name', { text: 'Wanderer' })]),
      this.box,
    ]);
  }

  /** A click means "finish typing" if we're mid-line, and "next" if we're not. */
  _advance() {
    if (this.typing) {
      this.shown = this.full.length;
      this._commit();
      return;
    }
    this.next();
  }

  async next(first = false) {
    if (!first) bus.emit('sfx', 'page');

    this.box.classList.add('is-fading');
    const q = await getQuote();

    this.full = `“${q.text}”`;
    this.shown = 0;
    this.typing = true;
    this._timer = 0;

    this.box.classList.remove('is-fading');
    this.arrow.classList.remove('is-ready');
    this.text.textContent = '';
    this.author.textContent = `— ${q.author}`;
    this.author.classList.remove('is-ready');

    if (++this.read >= 10) unlock('quotes10');
  }

  _commit() {
    this.typing = false;
    this.text.textContent = this.full;
    this.arrow.classList.add('is-ready');
    this.author.classList.add('is-ready');
  }

  tick({ dt, t }) {
    // ── The typewriter ──────────────────────────────────────────────────────
    if (this.typing) {
      this._timer -= dt;
      if (this._timer <= 0) {
        const ch = this.full[this.shown];
        this.shown++;

        // Dwell longer on punctuation. This one line is the difference between
        // "a machine printing" and "a person talking".
        const dwell =
          ch === '.' || ch === '!' || ch === '?' ? 0.22 :
          ch === ',' || ch === ';' || ch === '—' ? 0.12 :
          ch === ' ' ? 0.018 :
          0.026;
        this._timer = dwell;

        this.text.textContent = this.full.slice(0, this.shown);

        // A blip every few characters — one per character is a machine gun.
        if (this.shown % 3 === 0 && ch !== ' ') bus.emit('sfx', 'type');

        if (this.shown >= this.full.length) this._commit();
      }
    }

    // ── The blink ───────────────────────────────────────────────────────────
    // Random interval, 3–7s. A blink on a fixed timer is uncanny.
    this._blinkTimer -= dt;
    if (this._blinkTimer <= -0.12) {
      this._blinkTimer = 3 + Math.random() * 4;
      this.avatar.replaceChildren(this.faceOpen);
    } else if (this._blinkTimer <= 0 && this.avatar.firstChild !== this.faceBlink) {
      this.avatar.replaceChildren(this.faceBlink);
    }
  }
}
