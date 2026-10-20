/* ============================================================================
   PetLayer — the slime, out of its panel and living in the actual meadow.

   It is the SAME creature as the one in the Pixel Pet widget, not a copy. The
   panel is a close-up portrait; this is the animal itself, wandering the world
   behind your widgets, sleeping when it's dark, and bouncing when you feed it.
   Both listen to the same bus events, so they can never disagree about its mood.

   It wanders in and out from behind the panels, which is the whole charm: you
   catch it in the gaps. It is never *presented* to you. You just notice it.
   ========================================================================== */

import { Layer } from '../Layer.js';
import { horizon } from '../horizon.js';
import { bus } from '../../core/bus.js';
import { rgbCss, clamp, lerp, damp, mixRgb, rng, TAU } from '../../core/util.js';

export class PetLayer extends Layer {
  constructor() {
    super({ depth: 0.78, name: 'pet' });

    this.x = 0;
    this.y = 0;
    this.hop = 0; // height above the ground
    this.vy = 0;
    this.squash = 1;
    this.vsquash = 0;

    this.dir = 1;
    this.hopTimer = 2;
    this.blink = 3;
    this.joy = 0; // seconds of delight remaining
    this.hearts = [];

    // Feeding the pet in the panel makes the one in the world jump.
    bus.on('pet:fed', () => this._delight());
    bus.on('pet:poked', () => {
      this.squash = 0.6;
      this.vy = 34;
    });
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    // It lives on the near bank, in the band of meadow below the lake.
    const hz = horizon(H);
    this.groundTop = hz.petTop;
    this.groundBot = hz.petBot;

    const r = rng(606);
    this.x = W * (0.2 + r() * 0.6);
    this.y = lerp(this.groundTop, this.groundBot, r());
    this.target = this.x;
  }

  _delight() {
    this.joy = 2.6;
    this.vy = 90;
    this.squash = 1.35;
    for (let i = 0; i < 5; i++) {
      this.hearts.push({
        x: this.x + (Math.random() - 0.5) * 10,
        y: this.y - 8,
        vy: -12 - Math.random() * 10,
        vx: (Math.random() - 0.5) * 8,
        life: 0,
        max: 1.2 + Math.random() * 0.5,
      });
    }
  }

  update(env) {
    const { dt, pal, motion, pointer, beat } = env;

    const asleep = pal.night && this.joy <= 0;
    this.joy = Math.max(0, this.joy - dt);

    // ── Wander ──────────────────────────────────────────────────────────────
    // It picks a spot and hops toward it. Slimes do not walk.
    this.hopTimer -= dt;

    if (this.hopTimer <= 0 && this.hop <= 0.01 && !asleep && motion) {
      this.hopTimer = 1.4 + Math.random() * 3.2;

      // Pick a new destination now and then, rather than every hop — otherwise
      // it jitters on the spot instead of actually going somewhere.
      if (Math.random() < 0.4) {
        this.target = clamp(this.x + (Math.random() - 0.5) * 90, 12, this.W - 12);
        this.y = clamp(this.y + (Math.random() - 0.5) * 14, this.groundTop, this.groundBot);
      }

      this.dir = Math.sign(this.target - this.x) || this.dir;
      this.vy = 44 + Math.random() * 34;
      this.squash = 1.2;
    }

    /* It notices the cursor. Bring the pointer close and it hops AWAY — not far,
       and not always, but enough that you realise it saw you. A pet that ignores
       your cursor is a sprite; one that flinches is an animal. */
    if (motion && pointer.active && !asleep) {
      const d = Math.hypot(this.x - pointer.x, this.y - pointer.y);
      if (d < 26 && this.hop <= 0.01) {
        this.dir = Math.sign(this.x - pointer.x) || 1;
        this.target = clamp(this.x + this.dir * 40, 12, this.W - 12);
        this.vy = 62;
        this.squash = 1.25;
        this.hopTimer = 0.9;
      }
    }

    // On the beat, it bounces. Of course it does.
    if (beat && !asleep && this.hop <= 0.01) {
      this.vy = 30;
      this.squash = 1.14;
    }

    // ── Ballistics ──────────────────────────────────────────────────────────
    if (this.hop > 0 || this.vy > 0) {
      this.vy -= 240 * dt;
      this.hop += this.vy * dt;
      // Airborne, it drifts toward its target.
      this.x = damp(this.x, this.target, 1.6, dt);

      if (this.hop <= 0) {
        if (this.vy < -30) this.squash = clamp(1 - Math.abs(this.vy) / 300, 0.55, 0.95);
        this.hop = 0;
        this.vy = 0;
      }
    }

    // The same spring as the panel pet: it overshoots and wobbles like jelly.
    this.vsquash += (1 - this.squash) * 170 * dt - this.vsquash * 10 * dt;
    this.squash += this.vsquash * dt;

    this.blink -= dt;
    if (this.blink < -0.12) this.blink = 2.6 + Math.random() * 4;

    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.life += dt;
      h.y += h.vy * dt;
      h.x += h.vx * dt;
      h.vy += 5 * dt;
      if (h.life > h.max) this.hearts.splice(i, 1);
    }
  }

  draw(g, env) {
    const { pal, t, glow, season } = env;

    const asleep = pal.night && this.joy <= 0;
    const ox = this.ox(env);
    const oy = this.oy(env);

    const cx = this.x + ox;
    const baseY = this.y + oy;

    // ── Shadow ──────────────────────────────────────────────────────────────
    const lift = clamp(this.hop / 30, 0, 1);
    const shW = Math.round(lerp(11, 6, lift));
    g.globalAlpha = lerp(0.28, 0.1, lift) * (0.4 + pal.lum);
    g.fillStyle = '#000';
    g.fillRect(Math.round(cx - shW / 2), Math.round(baseY), shW, 1);
    g.globalAlpha = 1;

    // ── Body ────────────────────────────────────────────────────────────────
    const sq = clamp(this.squash, 0.5, 1.4);
    const rx = 6 / Math.sqrt(sq);
    const ry = 5 * sq;
    const breathe = 1 + Math.sin(t * (asleep ? 1.1 : 2.4)) * 0.04;
    const cy = baseY - this.hop - ry * breathe;

    // In winter it's a paler, sleepier green. Even the slime feels the cold.
    const chill = clamp(season.snow, 0, 1);
    const bodyBase = mixRgb([111, 208, 122], [150, 190, 200], chill * 0.5);

    const body = pal.lit(bodyBase, asleep ? 0.85 : 1);
    const light = pal.lit(mixRgb(bodyBase, [255, 255, 255], 0.4), asleep ? 0.9 : 1.1);
    const dark = pal.lit(mixRgb(bodyBase, [20, 60, 40], 0.45), 0.85);

    for (let y = -ry; y <= ry; y++) {
      const f = y / ry;
      const w = Math.round(Math.sqrt(Math.max(0, 1 - f * f)) * rx * breathe);
      if (w <= 0) continue;
      const yy = Math.round(cy + y * breathe + ry * breathe);
      g.fillStyle = rgbCss(f < -0.45 ? light : f > 0.5 ? dark : body);
      g.fillRect(Math.round(cx - w), yy, w * 2, 1);
    }

    // A glint, and a rim in the key light.
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.fillRect(Math.round(cx - rx * 0.5), Math.round(cy + ry * 0.4), 2, 1);

    // ── Face ────────────────────────────────────────────────────────────────
    const faceY = Math.round(cy + ry * 0.95);
    g.fillStyle = 'rgba(31,61,42,.95)';

    const eL = Math.round(cx - 3);
    const eR = Math.round(cx + 1);

    if (asleep || this.blink < 0) {
      g.fillRect(eL, faceY, 2, 1);
      g.fillRect(eR, faceY, 2, 1);
    } else if (this.joy > 0) {
      // ^ ^
      g.fillRect(eL, faceY + 1, 1, 1);
      g.fillRect(eL + 1, faceY, 1, 1);
      g.fillRect(eR, faceY, 1, 1);
      g.fillRect(eR + 1, faceY + 1, 1, 1);
    } else {
      g.fillRect(eL, faceY, 1, 2);
      g.fillRect(eR + 1, faceY, 1, 2);
    }

    // ── Zzz, at this scale, is a single pixel that rises. ───────────────────
    if (asleep) {
      const bob = (t * 6) % 6;
      g.globalAlpha = clamp(1 - bob / 6, 0, 1) * 0.8;
      g.fillStyle = '#fff';
      g.fillRect(Math.round(cx + 6), Math.round(cy - bob), 1, 1);
      g.globalAlpha = 1;

      // A slumbering slime glows, faintly. It's a magic slime.
      glow.globalAlpha = 0.2;
      g.fillStyle = rgbCss(body);
      glow.fillStyle = rgbCss(body);
      glow.fillRect(Math.round(cx - rx), Math.round(cy), Math.round(rx * 2), Math.round(ry));
      glow.globalAlpha = 1;
    }

    // ── Hearts ──────────────────────────────────────────────────────────────
    for (const h of this.hearts) {
      const a = clamp(1 - h.life / h.max, 0, 1);
      g.globalAlpha = a;
      g.fillStyle = '#ff8fa3';
      const hx = Math.round(h.x + ox);
      const hy = Math.round(h.y + oy);
      g.fillRect(hx, hy, 1, 1);
      g.fillRect(hx + 2, hy, 1, 1);
      g.fillRect(hx - 1, hy + 1, 5, 1);
      g.fillRect(hx, hy + 2, 3, 1);
      g.fillRect(hx + 1, hy + 3, 1, 1);
      g.globalAlpha = 1;
    }
  }
}
