/* ============================================================================
   input.js — hands and eyes: keyboard, mouse, pointer lock, and touch.

   Produces intent, never movement: a walk vector, a look delta, a "use" press
   and a tap-to-walk target. player.js decides what any of it does.

   Desktop: WASD or arrows walk; click locks the pointer (Esc releases it, the
   browser's rule, not ours); without pointer lock, drag to look; E uses.
   Touch: a thumbstick appears wherever the left thumb lands; the right thumb
   drags the view; a quick tap on the ground walks you there.
   ========================================================================== */

import { store } from '../core/store.js';

const WALK_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
const SENS = 0.0022; // radians per mouse pixel
const TOUCH_SENS = 0.006;
const STICK_R = 44;

const typing = (e) => {
  const t = e.target;
  return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
};

export class Input {
  constructor(canvas, hud) {
    this.canvas = canvas;
    this.hud = hud;
    this.keys = new Set();
    this.look = { dx: 0, dy: 0 };
    this.stick = { x: 0, y: 0 };
    this.tap = null; // { x, y } in NDC, once
    this.useQueued = false;
    this.locked = false;
    this.enabled = true;

    this._touches = new Map(); // pointerId → { role, x0, y0, x, y, t0 }
    this._drag = null;
    this._bind();
  }

  _bind() {
    const c = this.canvas;

    addEventListener('keydown', (e) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (WALK_KEYS[e.code]) {
        this.keys.add(e.code);
        if (e.code.startsWith('Arrow')) e.preventDefault(); // don't scroll the page
      }
      if (e.code === 'KeyE' && !e.repeat) this.useQueued = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
      document.documentElement.toggleAttribute('data-locked', this.locked);
    });

    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return this._touchDown(e);
      document.documentElement.removeAttribute('data-touch');
      if (store.get('view').pointerLock && !this.locked) {
        // Some browsers return a promise that rejects (e.g. right after Esc); that is fine.
        c.requestPointerLock?.()?.catch?.(() => {});
        return;
      }
      if (!this.locked) {
        this._drag = { x: e.clientX, y: e.clientY };
        c.setPointerCapture(e.pointerId);
      }
    });

    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look.dx += e.movementX * SENS;
      this.look.dy += e.movementY * SENS;
    });

    c.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return this._touchMove(e);
      if (this._drag) {
        this.look.dx += (e.clientX - this._drag.x) * SENS * 1.4;
        this.look.dy += (e.clientY - this._drag.y) * SENS * 1.4;
        this._drag.x = e.clientX;
        this._drag.y = e.clientY;
      }
    });

    const end = (e) => {
      if (e.pointerType === 'touch') return this._touchUp(e);
      this._drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  // ── Touch ─────────────────────────────────────────────────────────────
  _touchDown(e) {
    document.documentElement.setAttribute('data-touch', '');
    this.canvas.setPointerCapture(e.pointerId);
    const left = e.clientX < innerWidth * 0.45;
    const t = { role: left ? 'stick' : 'look', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now() };
    // One thumb per job.
    for (const other of this._touches.values()) if (other.role === t.role) return;
    this._touches.set(e.pointerId, t);
    if (left) this.hud.showStick(e.clientX, e.clientY);
  }

  _touchMove(e) {
    const t = this._touches.get(e.pointerId);
    if (!t) return;
    if (t.role === 'stick') {
      let dx = e.clientX - t.x0;
      let dy = e.clientY - t.y0;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {
        dx = (dx / d) * STICK_R;
        dy = (dy / d) * STICK_R;
      }
      this.stick.x = dx / STICK_R;
      this.stick.y = -dy / STICK_R;
      this.hud.moveKnob(dx, dy);
    } else {
      this.look.dx += (e.clientX - t.x) * TOUCH_SENS;
      this.look.dy += (e.clientY - t.y) * TOUCH_SENS;
    }
    t.x = e.clientX;
    t.y = e.clientY;
  }

  _touchUp(e) {
    const t = this._touches.get(e.pointerId);
    if (!t) return;
    this._touches.delete(e.pointerId);
    if (t.role === 'stick') {
      this.stick.x = this.stick.y = 0;
      this.hud.hideStick();
    } else if (performance.now() - t.t0 < 260 && Math.hypot(t.x - t.x0, t.y - t.y0) < 10) {
      // A tap, not a drag: walk to where it landed.
      this.tap = { x: (t.x / innerWidth) * 2 - 1, y: -(t.y / innerHeight) * 2 + 1 };
    }
  }

  /** Read and clear this frame's intent. */
  consume() {
    let x = this.stick.x;
    let y = this.stick.y;
    for (const k of this.keys) {
      x += WALK_KEYS[k][0];
      y += WALK_KEYS[k][1];
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    const out = {
      walk: this.enabled ? { x, y } : { x: 0, y: 0 },
      look: { ...this.look },
      tap: this.enabled ? this.tap : null,
      use: this.enabled && this.useQueued,
    };
    this.look.dx = this.look.dy = 0;
    this.tap = null;
    this.useQueued = false;
    return out;
  }

  queueUse() {
    this.useQueued = true;
  }
}
