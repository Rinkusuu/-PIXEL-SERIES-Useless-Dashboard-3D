/* ============================================================================
   hud.js — the little that is drawn over the world: the centre dot, the
   tooltip for the thing you are looking at, first-visit hints, the waking
   fade, and the touch thumbstick and use button. DOM, so a screen reader can
   read the tooltip and the use button is a real button.
   ========================================================================== */

import { el } from '../core/util.js';
import { store } from '../core/store.js';

export class Hud {
  constructor(onUse, onWatch, onPocket) {
    this.tipLabel = el('span');
    this.tipKey = el('span.w3d__key', { text: '  [E]' });
    this.tip = el('div.w3d__tip', { role: 'status', 'aria-live': 'polite' }, [this.tipLabel, this.tipKey]);
    this.knob = el('div.w3d__knob');
    this.stick = el('div.w3d__stick', {}, [this.knob]);
    this.use = el('button.btn.w3d__use', { type: 'button', text: 'Use', onclick: onUse });
    this.fade = el('div.w3d__fade');
    this.hints = el('div.w3d__hints');
    // What the watch, and anything else seen only in the world, says out loud.
    this.live = el('p.sr-only', { 'aria-live': 'polite' });
    // The clock's timer role, as the classic Local Time panel has it: the minute, never the second.
    this.timer = el('p.sr-only', { role: 'timer', 'aria-live': 'off' });
    this.watchBtn = el('button.btn.w3d__watch', { type: 'button', 'aria-label': 'Glance at your watch', text: '⌚', onclick: onWatch });
    this.pocketBtn = el('button.btn.w3d__pocket', { type: 'button', 'aria-label': 'Open your pocket book', text: '📖', onclick: onPocket });
    this.root = el('div.w3d', {}, [el('div.w3d__dot'), this.tip, this.stick, this.use, this.watchBtn, this.pocketBtn, this.hints, this.fade, this.live, this.timer]);
    document.body.append(this.root);

    const touch = matchMedia('(pointer: coarse)').matches;
    this.hints.innerHTML = touch
      ? 'left thumb walks · right thumb looks<br>tap the ground to go there'
      : 'click to look around · wasd walks · e uses<br>q glances at your watch · b opens your pocket book';
    this.hints.hidden = Boolean(store.get('hints3d'));
    this._target = null;
  }

  announce(text) {
    this.live.textContent = text;
  }

  /** Called once a second; writes only when the minute changes. */
  tickMinute(date) {
    const t = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (this.timer.textContent !== t) this.timer.textContent = t;
  }

  wakeUp() {
    requestAnimationFrame(() => this.fade.setAttribute('data-done', ''));
  }

  /** Once you have walked a few metres, you know how to walk. */
  retireHints() {
    if (this.hints.hidden) return;
    this.hints.hidden = true;
    store.set('hints3d', true);
  }

  setTarget(t) {
    if (t === this._target && (!t || this.tipLabel.textContent === t.label())) return;
    this._target = t;
    this.root.toggleAttribute('data-target', Boolean(t));
    if (t) {
      const label = t.label();
      this.tipLabel.textContent = label;
      this.use.textContent = label;
    }
  }

  /** The dot is one world pixel: as large as the upscale factor. */
  setPixel(scale) {
    this.root.style.setProperty('--w3d-px', `${Math.max(2, scale)}px`);
  }

  showStick(x, y) {
    this.stick.style.left = `${x}px`;
    this.stick.style.top = `${y}px`;
    this.stick.setAttribute('data-on', '');
    this.moveKnob(0, 0);
  }

  moveKnob(dx, dy) {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  hideStick() {
    this.stick.removeAttribute('data-on');
  }
}
