/* ============================================================================
   AchievementsWidget — fifteen tiny trophies for doing nothing.

   Locked achievements show their hint, not a "???" — a locked achievement you
   can't see the shape of is just an absence, whereas one you can see is a small
   invitation. (The exception in real games is spoilers. There are no spoilers
   here. The plot is: you sat down.)
   ========================================================================== */

import { Widget } from './Widget.js';
import { el } from '../core/util.js';
import { ACHIEVEMENTS, owned, progress } from '../core/achievements.js';

export class AchievementsWidget extends Widget {
  constructor() {
    super({ title: 'Tiny Achievements', icon: '🏆', className: 'w-ach' });
  }

  body() {
    this.list = el('div.ach__list', { role: 'list' });
    this.meter = el('div.meter');
    this.fill = el('i.meter__fill');
    this.meter.append(this.fill);
    this.count = el('p.ach__count');

    // Re-render when anything is unlocked. Cheap: 15 nodes.
    this.listen('achievement', () => this._render());
    this._render();

    return el('div.ach', {}, [this.meter, this.count, this.list]);
  }

  _render() {
    const have = owned();
    const { count, total } = progress();

    this.fill.style.width = `${(count / total) * 100}%`;
    this.count.textContent = `${count} of ${total} — all of them meaningless`;

    this.list.replaceChildren(
      ...ACHIEVEMENTS.map((a) => {
        const got = have.includes(a.id);
        return el(
          `div.ach__row${got ? '.is-got' : ''}`,
          {
            role: 'listitem',
            'aria-label': `${a.title}. ${got ? 'Unlocked.' : 'Locked. ' + a.hint}`,
          },
          [
            el('span.ach__ico', { text: got ? a.icon : '🔒', 'aria-hidden': 'true' }),
            el('span.ach__body', {}, [
              el('span.ach__title', { text: a.title }),
              el('span.ach__hint', { text: got ? 'unlocked' : a.hint }),
            ]),
          ]
        );
      })
    );
  }
}
