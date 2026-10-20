/* ============================================================================
   FortuneWidget — the daily fortune and your lucky number.

   Both are seeded from the CALENDAR DATE, not from Math.random(). That means
   they're stable all day and they change at midnight — so the fortune is *your
   fortune for today*, which is the only thing that makes a fake fortune feel
   real. A fortune that rerolls on refresh is just a random string.

   The re-roll button exists anyway, because of course it does. It costs a coin
   and it tells you it's cheating.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { el, rng, daySeed, hash } from '../core/util.js';
import { button } from '../ui/feedback.js';

const FORTUNES = [
  'A small, good thing will happen near a window.',
  'You will remember a song you had forgotten. It will be fine.',
  'Someone is thinking about texting you. They will not. This is not about you.',
  'The next cup of tea is the correct one.',
  'You will find something you were not looking for, in a drawer.',
  'Today is a good day to close eleven tabs.',
  'A cat will look at you with unearned suspicion.',
  'You are 4% more capable than you currently believe.',
  'The thing you are dreading takes nine minutes.',
  'Rest is not a reward for finishing. Rest is a component of finishing.',
  'You will nearly say something clever, and that counts.',
  'A cloud will pass in front of the sun at precisely the right moment.',
  'The email can wait. The email has always been able to wait.',
  'You will be, briefly, the most competent person in the room.',
  'Something you planted will turn out to be growing.',
  'Beware of Tuesday. Tuesday knows what it did.',
  'Your posture is bad right now. It is fine. But it is bad.',
  'You will hear a bird and, for one second, feel entirely okay.',
  'The answer is in the second place you look.',
  'Do the small thing. The small thing is the whole thing.',
  'A stranger will hold a door and it will fix your afternoon.',
  'You are allowed to like the thing that you like.',
  'Nothing is wrong. Check anyway, then stop checking.',
  'Today you will win an argument in the shower. Enjoy it.',
];

export class FortuneWidget extends Widget {
  constructor() {
    super({ title: 'Daily Fortune', icon: '🔮', className: 'w-fortune' });
    this.rerolls = 0;
  }

  body() {
    this.text = el('p.fort__text');
    this.num = el('div.fort__num');
    this.note = el('p.fort__note', { text: 'seeded by today’s date. it will not change until midnight.' });

    this.addTool(
      button({
        label: 'Reroll',
        title: 'Cheat',
        sfx: 'coin',
        onClick: () => this._reroll(),
      })
    );

    this._render(daySeed('fortune'));

    return el('div.fort', {}, [
      this.text,
      el('div.divider'),
      el('div.fort__lucky', {}, [
        el('span.stat__k', { text: 'Lucky number' }),
        this.num,
      ]),
      this.note,
    ]);
  }

  _render(seed) {
    const r = rng(seed);
    const fortune = FORTUNES[Math.floor(r() * FORTUNES.length)];
    const lucky = 1 + Math.floor(r() * 99);

    this.text.textContent = fortune;

    // Roll the number up to its value — a number that just *appears* is a label;
    // a number that lands is an event.
    this._spin(lucky);
  }

  _spin(target) {
    let n = 0;
    const steps = 14;
    let i = 0;
    clearInterval(this._spinner);
    this._spinner = setInterval(() => {
      i++;
      // Fast random, then settle onto the real value.
      n = i >= steps ? target : 1 + Math.floor(Math.random() * 99);
      this.num.textContent = String(n).padStart(2, '0');
      if (i >= steps) {
        clearInterval(this._spinner);
        this.num.classList.remove('is-land');
        void this.num.offsetWidth;
        this.num.classList.add('is-land');
      }
    }, 45);
  }

  _reroll() {
    this.rerolls++;
    // A different seed each time, but still deterministic within this session.
    this._render(hash(`${daySeed('fortune')}:reroll:${this.rerolls}`));
    this.note.textContent =
      this.rerolls === 1 ? 'that is not how fortunes work, but go on.'
      : this.rerolls < 5 ? 'you are rerolling your destiny. bold.'
      : 'destiny has stopped taking your calls.';
    bus.emit('coins', -1);
  }

  destroy() {
    clearInterval(this._spinner);
    super.destroy();
  }
}
