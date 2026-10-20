/* ============================================================================
   IdleWidget — coins accumulate while you do nothing, and a productivity meter
   reports, with total confidence, a number it has invented.

   The joke has structure: the productivity meter goes UP the longer you sit
   still, and the flavour text gets progressively more unhinged about it. It is
   an idle game whose only mechanic is not playing it.

   The coin rain is DOM, not canvas, because there are at most a dozen coins on
   screen and CSS animations on a dozen absolutely-positioned spans are free —
   whereas a canvas would need its own context, its own resize handling and its
   own place in the render loop, for the same twelve coins.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { store } from '../core/store.js';
import { el, clamp, lerp } from '../core/util.js';
import { unlock } from '../core/achievements.js';

const RATE = 0.42; // coins per second of doing nothing whatsoever

const VERDICTS = [
  [0,   'warming up'],
  [15,  'entering the zone'],
  [30,  'peak flow state'],
  [50,  'unstoppable'],
  [70,  'legendary output'],
  [85,  'historians will study this'],
  [96,  'you have transcended work itself'],
];

export class IdleWidget extends Widget {
  constructor() {
    super({ title: 'Idle Earnings', icon: '🪙', className: 'w-idle' });

    this.coins = store.get('coins');
    this.display = this.coins;
    this.productivity = 0;
    this._flushTimer = 0;
  }

  body() {
    this.num = el('div.idle__coins', { text: this._fmt(this.coins) });
    this.rate = el('p.idle__rate', { text: `+${RATE.toFixed(2)} / sec, for doing nothing` });

    this.meter = el('div.meter', { role: 'progressbar', 'aria-label': 'Productivity', 'aria-valuemin': '0', 'aria-valuemax': '100' });
    this.fill = el('i.meter__fill');
    this.meter.append(this.fill);

    this.verdict = el('p.idle__verdict', { text: 'warming up' });

    // Coins earned elsewhere (feeding the pet, drinking coffee) land here.
    this.listen('coins', (n) => this._add(n));

    return el('div.idle', {}, [
      el('div.idle__top', {}, [
        el('span.idle__ico', { text: '🪙', 'aria-hidden': 'true' }),
        this.num,
      ]),
      this.rate,
      el('div.divider'),
      el('div.stat__k', { text: 'Productivity (fabricated)' }),
      this.meter,
      this.verdict,
    ]);
  }

  _fmt(n) {
    const v = Math.floor(n);
    return v >= 10000 ? `${(v / 1000).toFixed(1)}k` : String(v);
  }

  _add(n) {
    this.coins = store.update('coins', (c) => Math.max(0, c + n));
    if (n > 0) {
      this._rain(Math.min(n, 6));
      bus.emit('sfx', 'coin');
    }
    if (this.coins >= 100) unlock('coins100');
  }

  /** Spawn coins that fall, spin and fade. */
  _rain(count) {
    for (let i = 0; i < count; i++) {
      const c = el('span.coin', {
        text: '🪙',
        'aria-hidden': 'true',
        style: {
          left: `${10 + Math.random() * 76}%`,
          '--dur': `${1 + Math.random() * 0.6}s`,
          '--spin': `${Math.random() > 0.5 ? 360 : -360}deg`,
          '--drift': `${(Math.random() - 0.5) * 40}px`,
          animationDelay: `${i * 70}ms`,
        },
      });
      this.root.append(c);
      setTimeout(() => c.remove(), 1900 + i * 70);
    }
  }

  tick({ dt }) {
    // ── Coins ───────────────────────────────────────────────────────────────
    this.coins += RATE * dt;

    // The displayed number CHASES the real one, so a big award counts up
    // instead of jumping. A number that jumps is a variable; a number that
    // counts is a reward.
    this.display = lerp(this.display, this.coins, 1 - Math.exp(-6 * dt));
    const shown = this._fmt(this.display);
    if (this.num.textContent !== shown) this.num.textContent = shown;

    // Persist at 1Hz, not 60Hz.
    this._flushTimer -= dt;
    if (this._flushTimer <= 0) {
      this._flushTimer = 1;
      store.set('coins', this.coins);
      if (this.coins >= 100) unlock('coins100');
    }

    // ── Productivity ────────────────────────────────────────────────────────
    // Climbs while idle. Asymptotic, so it never quite reaches 100 — the last
    // 2% of any progress bar is where all the comedy lives.
    this.productivity = clamp(this.productivity + (100 - this.productivity) * 0.012 * dt, 0, 99.4);

    const pct = this.productivity;
    this.fill.style.width = `${pct}%`;
    this.meter.setAttribute('aria-valuenow', String(Math.round(pct)));

    let v = VERDICTS[0][1];
    for (const [at, text] of VERDICTS) if (pct >= at) v = text;
    if (this.verdict.textContent !== v) this.verdict.textContent = v;
  }
}
