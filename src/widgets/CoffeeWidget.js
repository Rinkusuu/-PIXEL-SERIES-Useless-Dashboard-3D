/* ============================================================================
   CoffeeWidget — a counter. You press it when you have coffee. It believes you.

   The cup is drawn in canvas so the steam can actually rise and the level can
   actually drop. The count resets daily, because a coffee counter that has been
   accumulating since March is a health warning, not a widget.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { store } from '../core/store.js';
import { el, clamp, TAU } from '../core/util.js';
import { button } from '../ui/feedback.js';
import { unlock } from '../core/achievements.js';

const W = 64;
const H = 64;

const VERDICTS = [
  'a clear head. suspicious.',
  'one. balanced. respectable.',
  'two. the correct number.',
  'three. we are in the zone.',
  'four. you can hear colours.',
  'five. your heart has opinions.',
  'six. time has become a suggestion.',
];

export class CoffeeWidget extends Widget {
  constructor() {
    super({ title: 'Coffee', icon: '☕', className: 'w-coffee' });

    // Reset the count on a new day. Stored as a date stamp, not a timer, so it
    // survives the tab being closed overnight.
    const today = new Date().toDateString();
    if (store.get('coffeeDay') !== today) {
      store.set('coffeeDay', today);
      store.set('coffee', 0);
    }

    this.count = store.get('coffee');
    this.steam = [];
    this._steamTimer = 0;
    this.sip = 0; // 0–1, drains the cup on press
  }

  body() {
    this.cv = el('canvas.cof__cv', {
      width: W, height: H,
      'aria-hidden': 'true',
      onclick: () => this._drink(),
    });
    this.g = this.cv.getContext('2d');
    this.g.imageSmoothingEnabled = false;

    this.num = el('div.cof__count', { text: String(this.count) });
    this.verdict = el('p.cof__verdict');

    this.addTool(button({ label: '+1', sfx: 'sip', onClick: () => this._drink() }));

    this.listen('cmd:coffee', () => this._drink());

    this._paint();

    return el('div.cof', {}, [
      el('div.cof__stage', {}, [this.cv]),
      el('div.cof__read', {}, [
        this.num,
        el('span.stat__k', { text: 'cups today' }),
      ]),
      this.verdict,
    ]);
  }

  _drink() {
    this.count = store.update('coffee', (n) => n + 1);
    this.sip = 1; // the cup empties, then refills
    bus.emit('sfx', 'sip');
    bus.emit('coins', 1);

    if (this.count >= 5) unlock('coffee5');
    if (this.count >= 20) unlock('coffee20');

    this.num.classList.remove('is-pop');
    void this.num.offsetWidth;
    this.num.classList.add('is-pop');

    this._paint();
  }

  _paint() {
    this.num.textContent = String(this.count);
    this.verdict.textContent =
      VERDICTS[Math.min(this.count, VERDICTS.length - 1)] ??
      `${this.count}. this is a cry for help, and we hear you.`;
  }

  tick({ dt, t }) {
    // The cup refills after a sip.
    this.sip = Math.max(0, this.sip - dt * 0.9);

    // Steam. More cups, more steam — the widget gets visibly more agitated.
    this._steamTimer -= dt;
    if (this._steamTimer <= 0) {
      this._steamTimer = 0.22;
      this.steam.push({
        x: W / 2 + (Math.random() - 0.5) * 10,
        y: 22,
        life: 0,
        max: 1.6 + Math.random() * 0.8,
        drift: (Math.random() - 0.5) * 8,
      });
    }

    for (let i = this.steam.length - 1; i >= 0; i--) {
      const s = this.steam[i];
      s.life += dt;
      s.y -= dt * 11;
      s.x += Math.sin(t * 2 + s.life * 3) * 6 * dt + s.drift * dt;
      if (s.life > s.max) this.steam.splice(i, 1);
    }

    this._draw(t);
  }

  _draw(t) {
    const g = this.g;
    g.clearRect(0, 0, W, H);

    const css = getComputedStyle(this.root);
    const glow = css.getPropertyValue('--amb-glow').trim() || '#ffd479';

    // ── Steam (behind the cup) ──────────────────────────────────────────────
    for (const s of this.steam) {
      const f = s.life / s.max;
      g.globalAlpha = Math.sin(f * Math.PI) * 0.35;
      g.fillStyle = '#ffffff';
      const size = 1 + Math.round(f * 2);
      g.fillRect(Math.round(s.x), Math.round(s.y), size, size);
    }
    g.globalAlpha = 1;

    // ── Saucer ──────────────────────────────────────────────────────────────
    g.fillStyle = '#c9cfe0';
    g.fillRect(12, 52, 40, 3);
    g.fillStyle = '#9aa2ba';
    g.fillRect(12, 55, 40, 2);

    // ── Cup ─────────────────────────────────────────────────────────────────
    g.fillStyle = '#f2f4fb';
    g.fillRect(18, 26, 28, 26);
    g.fillStyle = '#d5dae8';
    g.fillRect(18, 26, 3, 26); // left shading
    g.fillRect(43, 26, 3, 26);

    // Handle.
    g.fillStyle = '#f2f4fb';
    g.fillRect(46, 32, 3, 3);
    g.fillRect(49, 35, 3, 6);
    g.fillRect(46, 41, 3, 3);

    // ── Coffee ──────────────────────────────────────────────────────────────
    // The surface drops when you sip and rises back as it "refills".
    const level = 4 + this.sip * 12;
    const surfaceY = 29 + level;
    const depth = 52 - surfaceY - 2;

    if (depth > 0) {
      g.fillStyle = '#4a2c1e';
      g.fillRect(21, surfaceY, 22, depth);

      // The meniscus: a lighter ellipse of liquid at the top, with a ripple.
      const wob = Math.sin(t * 3) * 0.5;
      g.fillStyle = '#6b4030';
      g.fillRect(21, Math.round(surfaceY + wob), 22, 2);
      // A crema highlight, tinted by the world's key light.
      g.fillStyle = glow;
      g.globalAlpha = 0.25;
      g.fillRect(24, Math.round(surfaceY + wob), 8, 1);
      g.globalAlpha = 1;
    }

    // Rim, drawn last so it sits over the coffee.
    g.fillStyle = '#ffffff';
    g.fillRect(18, 26, 28, 2);
  }
}
