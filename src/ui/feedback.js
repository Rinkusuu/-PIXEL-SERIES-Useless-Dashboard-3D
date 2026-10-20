/* ============================================================================
   feedback.js — toasts, click ripples, and the "juice" that makes a UI feel
   like it's made of objects rather than of divs.

   Every interactive control in this app should respond in three channels at
   once: it MOVES (transform), it SOUNDS (a blip), and it LEAVES A MARK (the
   ripple). Any two of the three feels incomplete; all three is why a Nintendo
   menu feels good and a bootstrap form doesn't.
   ========================================================================== */

import { bus } from '../core/bus.js';
import { el, $ } from '../core/util.js';

/* ── Toasts ──────────────────────────────────────────────────────────────── */

const MAX_TOASTS = 3;
let host = null;

export function toast({ icon = '✨', text = '', ms = 3200 } = {}) {
  host ??= $('#toasts');
  if (!host) return;

  // Never let toasts stack into a wall. Oldest goes first.
  while (host.children.length >= MAX_TOASTS) host.firstElementChild.remove();

  const node = el('div.toast', {}, [
    el('span.toast__ico', { text: icon }),
    el('span.toast__txt', { text }),
  ]);
  host.append(node);

  setTimeout(() => {
    node.dataset.leaving = 'true';
    // Match the CSS exit duration; removing early kills the animation mid-frame.
    setTimeout(() => node.remove(), 260);
  }, ms);
}

bus.on('toast', toast);

/* ── Ripple ──────────────────────────────────────────────────────────────── */

/**
 * Spawn a ripple at the click point inside `host` (which must be positioned and
 * `overflow: hidden`, as .btn and .tbtn are).
 */
export function ripple(host, event) {
  const r = host.getBoundingClientRect();
  const x = (event?.clientX ?? r.left + r.width / 2) - r.left;
  const y = (event?.clientY ?? r.top + r.height / 2) - r.top;

  const node = el('span.ripple', { style: { left: `${x}px`, top: `${y}px` } });
  host.append(node);
  // The animation is `forwards`, so the node would sit there forever otherwise.
  setTimeout(() => node.remove(), 540);
}

/* ── The one true button factory ─────────────────────────────────────────── */

/**
 * Build a button that already has all three feedback channels wired.
 * Every clickable thing in the app goes through here — which is how they all
 * end up feeling identical, and why adding a new one can't get it wrong.
 */
export function button({
  label = '',
  icon = '',
  sfx = 'click',
  primary = false,
  iconOnly = false,
  title = '',
  onClick = () => {},
} = {}) {
  const cls = ['btn', primary && 'btn--primary', iconOnly && 'btn--icon']
    .filter(Boolean)
    .join('.');

  const node = el(`button.${cls}`, {
    type: 'button',
    title: title || label,
    'aria-label': iconOnly ? title || label : undefined,
    onclick: (e) => {
      ripple(node, e);
      bus.emit('sfx', sfx);
      onClick(e, node);
    },
    // Hover blips are pleasant on a button you're aiming at, and maddening on
    // one you sweep across. `pointerenter` (not `over`) fires once, on arrival.
    onpointerenter: () => bus.emit('sfx', 'hover'),
  });

  /* An icon-only button with no `icon` would otherwise render as an empty box:
     `iconOnly` suppresses the text span, and there'd be nothing to take its
     place. Treat the label as the glyph — it's what the caller meant, and it
     guarantees a .btn__ico is always present for callers that reach in to
     swap the glyph (the play/pause toggle does exactly that). */
  const glyph = icon || (iconOnly ? label : '');
  if (glyph) node.append(el('span.btn__ico', { text: glyph, 'aria-hidden': 'true' }));
  if (label && !iconOnly) node.append(el('span.btn__txt', { text: label }));

  return node;
}
