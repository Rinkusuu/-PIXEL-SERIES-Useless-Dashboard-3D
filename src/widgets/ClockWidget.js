/* ============================================================================
   ClockWidget — the hero. HH:MM:SS in a glowing pixel font, plus the date, the
   day, and the timezone.

   Two details do 90% of the work here:

   1. Digits are individually swapped and re-animated ONLY when they change. If
      you re-render the whole string every second, every digit flickers and the
      clock reads as a text field. When only the seconds' ones-place flips, your
      eye tracks a single moving element — which is what a real flip-clock does
      and why it's satisfying.

   2. The colon BLINKS on the half-second, and the seconds tick with a tiny
      scale bump. A digital clock with a static colon is a screenshot.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { el, pad2 } from '../core/util.js';
import { store } from '../core/store.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export class ClockWidget extends Widget {
  constructor() {
    super({ title: 'Local Time', span: 'span-2', icon: '⏰', className: 'w-clock' });
    this.cells = new Map(); // key → the <span> holding one digit
  }

  body() {
    this.tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    /* Each digit gets its own cell so it can animate independently. The colons
       are separate elements so they can blink without disturbing the digits. */
    const digit = (key) => {
      const node = el('span.clk__d', { text: '0' });
      this.cells.set(key, node);
      return node;
    };

    this.colonA = el('span.clk__c', { text: ':' });
    this.colonB = el('span.clk__c', { text: ':' });

    this.time = el('div.clk__time', { 'aria-hidden': 'true' }, [
      digit('h0'), digit('h1'),
      this.colonA,
      digit('m0'), digit('m1'),
      this.colonB,
      el('span.clk__sec', {}, [digit('s0'), digit('s1')]),
    ]);

    // The visible clock is decorative markup; THIS is what a screen reader gets.
    this.live = el('p.sr-only', { role: 'timer', 'aria-live': 'off' });

    this.day = el('p.clk__day');
    this.date = el('p.clk__date');
    this.meta = el('p.clk__meta');

    this.second(new Date());

    return el('div.clk', {}, [
      this.time,
      this.live,
      el('div.clk__foot', {}, [
        el('div', {}, [this.day, this.date]),
        this.meta,
      ]),
    ]);
  }

  /** Swap one digit, and only re-trigger its animation if the value changed. */
  _set(key, value) {
    const cell = this.cells.get(key);
    if (!cell || cell.textContent === value) return;

    cell.textContent = value;
    // Restart the CSS animation. Removing the class and forcing a reflow is the
    // canonical way; `offsetWidth` is the read that flushes it.
    cell.classList.remove('is-flip');
    void cell.offsetWidth;
    cell.classList.add('is-flip');
  }

  second(now) {
    const h = pad2(now.getHours());
    const m = pad2(now.getMinutes());
    const s = pad2(now.getSeconds());

    /* The hour, chimed.

       Guarded three ways, because an app that makes a noise you did not ask for
       is an app you close. Sound is opt-in and off by default, so this is silent
       until you have already said yes to sound. `_hour` starts as the hour we
       loaded in, so opening the tab at 3:00:04 does not immediately ring at you.
       And it never fires twice, because it fires on the CHANGE. */
    const hour = now.getHours();
    if (this._hour == null) this._hour = hour;
    if (hour !== this._hour) {
      this._hour = hour;
      bus.emit('sfx', 'chime');
    }

    this._set('h0', h[0]);
    this._set('h1', h[1]);
    this._set('m0', m[0]);
    this._set('m1', m[1]);
    this._set('s0', s[0]);
    this._set('s1', s[1]);

    this.day.textContent = DAYS[now.getDay()];
    this.date.textContent = `${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

    const offset = -now.getTimezoneOffset() / 60;
    const sign = offset >= 0 ? '+' : '−';
    this.meta.innerHTML = '';
    this.meta.append(
      el('span.clk__tz', { text: this.tz.replace(/_/g, ' ') }),
      el('span.clk__utc', { text: `UTC${sign}${Math.abs(offset)}` })
    );

    // Announce only the minute — a screen reader reading the seconds aloud
    // sixty times a minute is a denial-of-service attack on its user.
    this.live.textContent = `${h}:${m}`;

    // The colon blink is driven off the parity of the second so it stays locked
    // to real time instead of drifting with a CSS animation.
    const on = now.getSeconds() % 2 === 0;
    this.colonA.classList.toggle('is-dim', !on);
    this.colonB.classList.toggle('is-dim', !on);
  }
}
