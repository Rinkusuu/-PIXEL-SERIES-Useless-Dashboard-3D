/* ============================================================================
   FactsWidget — a fact. It rotates on its own, and you can nudge it.

   The facts are true. That's the joke: everything else on this dashboard is
   invented, and the one widget that sounds like nonsense is the one telling you
   verified things about wombats.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { el } from '../core/util.js';
import { button } from '../ui/feedback.js';

const FACTS = [
  'Wombat droppings are cubes. The shape stops them rolling off the rocks the wombat leaves them on, as a message.',
  'Honey never spoils. Archaeologists have eaten 3,000-year-old honey from Egyptian tombs and reported it fine.',
  'A day on Venus is longer than a year on Venus.',
  'Octopuses have three hearts. Two stop beating when they swim, which is why they would rather walk.',
  'Bananas are berries. Strawberries are not.',
  'There are more possible arrangements of a shuffled deck of cards than there are atoms on Earth.',
  'Sea otters hold hands while sleeping so they do not drift apart.',
  'The Eiffel Tower can be up to 15 cm taller in summer, because iron expands in the heat.',
  'Sharks existed before trees did, by about 50 million years.',
  'A group of flamingos is called a flamboyance.',
  'Cows have best friends and become measurably stressed when separated from them.',
  'The shortest war in history lasted 38 minutes.',
  'Scotland has 421 words for snow.',
  'Norway once knighted a penguin. He is a brigadier now.',
  'Your stomach lining replaces itself every few days, or it would digest itself.',
  'A single strand of spaghetti is called a spaghetto.',
  'Butterflies taste with their feet.',
  'The dot over a lowercase i or j is called a tittle.',
  'Hot water can freeze faster than cold water. Nobody fully agrees on why.',
  'Venus is the only planet that spins clockwise.',
  'Snails can sleep for up to three years. This is the correct approach.',
  'The unicorn is the national animal of Scotland.',
  'Bubble wrap was invented as wallpaper. It failed as wallpaper.',
  'There is enough DNA in your body to stretch to Pluto and back, roughly seventeen times.',
  'Clouds look weightless and a small one weighs about as much as a hundred elephants.',
];

const ROTATE_EVERY = 24; // seconds

export class FactsWidget extends Widget {
  constructor() {
    super({ title: 'Useless Fact', icon: '💡', className: 'w-fact' });
    this.i = Math.floor(Math.random() * FACTS.length);
    this._timer = ROTATE_EVERY;
  }

  body() {
    this.text = el('p.fact__text', { 'aria-live': 'polite' });

    this.addTool(
      button({ label: 'Another', sfx: 'page', onClick: () => this._next() })
    );

    this._paint();

    return el('div.fact', {}, [
      el('span.fact__mark', { text: '❝', 'aria-hidden': 'true' }),
      this.text,
      el('p.fact__note', { text: 'this one is actually true' }),
    ]);
  }

  _next() {
    // Step by a coprime stride rather than reshuffling — you see every fact
    // before you see any of them twice, and it never repeats back-to-back.
    this.i = (this.i + 7) % FACTS.length;
    this._timer = ROTATE_EVERY;
    this._paint();
  }

  _paint() {
    this.text.classList.remove('is-in');
    void this.text.offsetWidth;
    this.text.textContent = FACTS[this.i];
    this.text.classList.add('is-in');
  }

  tick({ dt }) {
    this._timer -= dt;
    if (this._timer <= 0) {
      this._timer = ROTATE_EVERY;
      this.i = (this.i + 7) % FACTS.length;
      this._paint();
    }
  }
}
