/* ============================================================================
   PetWidget — a slime. It lives in a canvas, it is completely useless, and it
   is almost certainly the reason anyone keeps this tab open.

   The animation is entirely procedural — no sprite sheet — because a slime is a
   BLOB, and a blob is the one creature you can animate convincingly with pure
   maths:

     · SQUASH AND STRETCH. Volume is conserved: when it flattens it also widens.
       This single rule is the oldest one in animation and it does more work than
       every other line in this file.
     · The body is drawn as a stack of horizontal pixel spans, so it stays on
       the pixel grid while still being a smooth deformable shape.
     · IDLE ≠ STILL. Between hops it breathes, it blinks, and every so often it
       looks around. A creature that freezes between actions is a puppet.
     · It reacts. Feed it and it bounces and its eyes turn into ^^. Click it and
       it squishes. Leave it alone too long and it dozes off.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { store } from '../core/store.js';
import { el, clamp, lerp, damp, TAU, rng } from '../core/util.js';
import { button } from '../ui/feedback.js';
import { unlock } from '../core/achievements.js';

const W = 96;
const H = 72;

const MOODS = {
  happy: { eyes: 'open', mouth: 'smile' },
  joy: { eyes: 'happy', mouth: 'open' },
  sleepy: { eyes: 'closed', mouth: 'flat' },
  squish: { eyes: 'wide', mouth: 'o' },
};

export class PetWidget extends Widget {
  constructor() {
    super({ title: 'Pixel Pet', icon: '🟢', className: 'w-pet' });

    this.mood = 'happy';
    this._moodTimer = 0;

    // Physics.
    this.y = 0; // height above the ground
    this.vy = 0;
    this.squash = 1; // 1 = round, <1 = flat, >1 = tall
    this.vsquash = 0;
    this.hopTimer = 1.5;
    this.lookX = 0;
    this.blink = 3;
    this.idle = 0;

    this.hearts = [];
  }

  body() {
    this.cv = el('canvas.pet__cv', {
      width: W, height: H,
      role: 'img',
      'aria-label': 'A small green slime, bouncing.',
      onclick: () => this._poke(),
    });
    this.g = this.cv.getContext('2d');
    this.g.imageSmoothingEnabled = false;

    this.name = el('div.pet__name', { text: store.get('petName') });
    this.status = el('div.pet__status', { text: 'existing peacefully' });

    this.addTool(button({ label: 'Feed', sfx: 'pop', onClick: () => this._feed() }));

    this.listen('cmd:feed', () => this._feed());

    return el('div.pet', {}, [
      el('div.pet__stage', {}, [this.cv]),
      el('div.pet__info', {}, [this.name, this.status]),
    ]);
  }

  _poke() {
    bus.emit('sfx', 'pop');
    // A poke is a hard squash + a small pop upward.
    this.squash = 0.55;
    this.vsquash = 0;
    this.vy = 40;
    this._setMood('squish', 0.6);
    this.idle = 0;

    // The slime out in the meadow is the SAME creature. It flinches too.
    bus.emit('pet:poked');
  }

  _feed() {
    const fed = store.update('petFed', (n) => n + 1);
    store.set('petLastFed', Date.now());

    this.vy = 165; // a big, delighted hop
    this.squash = 1.35;
    this._setMood('joy', 2.2);
    this.idle = 0;

    for (let i = 0; i < 5; i++) {
      this.hearts.push({
        x: W / 2 + (Math.random() - 0.5) * 26,
        y: H - 22 - Math.random() * 10,
        vy: -14 - Math.random() * 16,
        vx: (Math.random() - 0.5) * 14,
        life: 0,
        max: 1.1 + Math.random() * 0.5,
      });
    }

    unlock('petfed');
    if (fed >= 10) unlock('petfed10');
    bus.emit('coins', 1);
    // …and out in the meadow, it jumps for joy where you can actually see it.
    bus.emit('pet:fed');
    this.status.textContent = fed >= 10 ? 'utterly devoted to you' : 'delighted';
  }

  _setMood(mood, seconds) {
    this.mood = mood;
    this._moodTimer = seconds;
  }

  tick({ dt, t }) {
    this.idle += dt;

    // ── Mood ────────────────────────────────────────────────────────────────
    if (this._moodTimer > 0) {
      this._moodTimer -= dt;
      if (this._moodTimer <= 0) this.mood = 'happy';
    } else if (this.idle > 22 && this.mood !== 'sleepy') {
      this._setMood('sleepy', 1e9);
      this.status.textContent = 'asleep. do not wake it.';
    }

    const asleep = this.mood === 'sleepy';

    // ── Hop ─────────────────────────────────────────────────────────────────
    this.hopTimer -= dt;
    if (this.hopTimer <= 0 && this.y <= 0.01 && !asleep) {
      this.hopTimer = 1.6 + Math.random() * 2.6;
      this.vy = 55 + Math.random() * 45;
      this.squash = 1.22; // stretch on take-off
    }

    // ── Ballistics ──────────────────────────────────────────────────────────
    this.vy -= 330 * dt; // gravity
    this.y += this.vy * dt;

    if (this.y <= 0) {
      if (this.vy < -40) {
        // Landing impact scales with how hard it hit. A constant squash on
        // landing looks like an animation cycle; this looks like a collision.
        this.squash = clamp(1 - Math.abs(this.vy) / 420, 0.5, 0.95);
        this.vsquash = 0;
        if (Math.abs(this.vy) > 90) bus.emit('sfx', 'pop');
      }
      this.y = 0;
      this.vy = 0;
    }

    /* ── Squash as a SPRING ───────────────────────────────────────────────────
       Not an ease. A spring overshoots — it flattens, rebounds past round, and
       wobbles back. That overshoot is what makes it read as jelly instead of
       rubber. k = stiffness, d = damping. */
    const k = 190;
    const d = 11;
    this.vsquash += (1 - this.squash) * k * dt - this.vsquash * d * dt;
    this.squash += this.vsquash * dt;

    // Airborne slimes stretch along their velocity.
    if (this.y > 0.5) {
      this.squash = damp(this.squash, 1 + clamp(this.vy / 260, -0.28, 0.3), 8, dt);
    }

    // ── Idle life ───────────────────────────────────────────────────────────
    this.blink -= dt;
    if (this.blink < -0.1) this.blink = 2.5 + Math.random() * 3.5;

    // It glances around, slowly, while it waits.
    this.lookX = Math.sin(t * 0.4) * 2 + Math.sin(t * 0.13) * 1.5;

    // ── Hearts ──────────────────────────────────────────────────────────────
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.life += dt;
      h.y += h.vy * dt;
      h.x += h.vx * dt;
      h.vy += 6 * dt; // they slow as they rise
      if (h.life > h.max) this.hearts.splice(i, 1);
    }

    this._draw(t, asleep);
  }

  _draw(t, asleep) {
    const g = this.g;
    g.clearRect(0, 0, W, H);

    const css = getComputedStyle(this.root);
    const glow = css.getPropertyValue('--amb-glow').trim() || '#ffd479';

    const groundY = H - 10;
    const cx = W / 2;

    // ── Shadow ──────────────────────────────────────────────────────────────
    // It shrinks and fades as the slime rises. This is the only depth cue the
    // scene has, and without it the slime just slides up and down a wall.
    const lift = clamp(this.y / 48, 0, 1);
    const shW = Math.round(lerp(30, 16, lift));
    g.globalAlpha = lerp(0.3, 0.1, lift);
    g.fillStyle = '#000';
    g.fillRect(Math.round(cx - shW / 2), groundY + 2, shW, 3);
    g.globalAlpha = 1;

    // ── Body ────────────────────────────────────────────────────────────────
    // Conserve area: the wider it gets, the shorter it must be.
    const sq = clamp(this.squash, 0.45, 1.45);
    const rx = 22 / Math.sqrt(sq);
    const ry = 18 * sq;

    // Breathing, when it isn't doing anything else.
    const breathe = 1 + Math.sin(t * (asleep ? 1.1 : 2.2)) * 0.03;

    const baseY = groundY - this.y - ry * breathe;

    const body = asleep ? '#5aa36a' : '#6fd07a';
    const bodyDark = asleep ? '#3d7a4e' : '#4aa85c';
    const bodyLight = asleep ? '#8fd49a' : '#a8f0b0';

    /* Draw as horizontal spans. For each scanline, solve the ellipse for its
       half-width and fill one 1px row. Stays perfectly on the pixel grid. */
    for (let y = -ry; y <= ry; y++) {
      const f = y / ry;
      const w = Math.round(Math.sqrt(Math.max(0, 1 - f * f)) * rx * breathe);
      if (w <= 0) continue;

      const yy = Math.round(baseY + y * breathe + ry * breathe);
      // A slime is translucent: lighter at the top where light passes through,
      // darker at the bottom where it pools.
      const shade = f < -0.45 ? bodyLight : f > 0.5 ? bodyDark : body;

      g.fillStyle = shade;
      g.fillRect(Math.round(cx - w), yy, w * 2, 1);
    }

    // Specular highlight — a fixed glint, up and to the left.
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fillRect(Math.round(cx - rx * 0.45), Math.round(baseY + ry * 0.35), 4, 3);
    g.fillRect(Math.round(cx - rx * 0.45) + 4, Math.round(baseY + ry * 0.35) - 1, 2, 2);

    // Rim light from the scene's key light. Ties the pet to the world outside.
    g.fillStyle = glow;
    g.globalAlpha = 0.35;
    g.fillRect(Math.round(cx + rx * 0.5), Math.round(baseY + ry * 0.5), 3, 6);
    g.globalAlpha = 1;

    // ── Face ────────────────────────────────────────────────────────────────
    const faceY = Math.round(baseY + ry * 0.9);
    const ex = Math.round(this.lookX);
    const blinking = this.blink < 0 && !asleep;
    const m = MOODS[this.mood] ?? MOODS.happy;

    g.fillStyle = '#1f3d2a';

    const eyeL = Math.round(cx - 8 + ex);
    const eyeR = Math.round(cx + 4 + ex);

    if (asleep || m.eyes === 'closed' || blinking) {
      // Closed: a flat line.
      g.fillRect(eyeL, faceY + 1, 4, 1);
      g.fillRect(eyeR, faceY + 1, 4, 1);
    } else if (m.eyes === 'happy') {
      // ^ ^ — two little arcs. The universal pixel-art "delighted".
      g.fillRect(eyeL + 1, faceY, 2, 1);
      g.fillRect(eyeL, faceY + 1, 1, 1);
      g.fillRect(eyeL + 3, faceY + 1, 1, 1);
      g.fillRect(eyeR + 1, faceY, 2, 1);
      g.fillRect(eyeR, faceY + 1, 1, 1);
      g.fillRect(eyeR + 3, faceY + 1, 1, 1);
    } else if (m.eyes === 'wide') {
      g.fillRect(eyeL, faceY - 1, 4, 4);
      g.fillRect(eyeR, faceY - 1, 4, 4);
      g.fillStyle = '#fff';
      g.fillRect(eyeL + 1, faceY, 1, 1);
      g.fillRect(eyeR + 1, faceY, 1, 1);
    } else {
      g.fillRect(eyeL, faceY, 3, 4);
      g.fillRect(eyeR, faceY, 3, 4);
      // Catchlights. Two white pixels are the entire difference between "alive"
      // and "taxidermy".
      g.fillStyle = '#fff';
      g.fillRect(eyeL + 1, faceY + 1, 1, 1);
      g.fillRect(eyeR + 1, faceY + 1, 1, 1);
    }

    g.fillStyle = '#1f3d2a';
    const mx = Math.round(cx - 2 + ex);
    if (m.mouth === 'open') {
      g.fillRect(mx, faceY + 6, 5, 3);
    } else if (m.mouth === 'o') {
      g.fillRect(mx + 1, faceY + 6, 3, 3);
    } else if (m.mouth === 'flat') {
      g.fillRect(mx, faceY + 7, 4, 1);
    } else {
      // A smile: down, across, up.
      g.fillRect(mx, faceY + 6, 1, 1);
      g.fillRect(mx + 1, faceY + 7, 3, 1);
      g.fillRect(mx + 4, faceY + 6, 1, 1);
    }

    // ── Zzz ─────────────────────────────────────────────────────────────────
    if (asleep) {
      g.fillStyle = 'rgba(255,255,255,.7)';
      g.font = '8px monospace';
      const bob = Math.sin(t * 1.6) * 2;
      g.fillText('z', cx + 22, baseY + 4 + bob);
      g.fillText('z', cx + 27, baseY - 2 + bob * 0.6);
    }

    // ── Hearts ──────────────────────────────────────────────────────────────
    for (const h of this.hearts) {
      const f = h.life / h.max;
      g.globalAlpha = clamp(1 - f, 0, 1);
      g.fillStyle = '#ff8fa3';
      const x = Math.round(h.x);
      const y = Math.round(h.y);
      // A 5×5 pixel heart.
      g.fillRect(x, y, 1, 1);
      g.fillRect(x + 2, y, 1, 1);
      g.fillRect(x - 1, y + 1, 5, 1);
      g.fillRect(x, y + 2, 3, 1);
      g.fillRect(x + 1, y + 3, 1, 1);
      g.globalAlpha = 1;
    }
  }
}
