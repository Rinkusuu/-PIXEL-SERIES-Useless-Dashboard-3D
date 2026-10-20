/* ============================================================================
   zen-ui.js — the overlay. The engine lives in core/zen.js; this is its face.

   A breathing ring, one instruction, and a countdown. Everything else on the
   page fades away.

   The ring is drawn on canvas rather than animated in CSS for one specific
   reason: it has to be locked to the SAME breath value the world is using, and a
   CSS animation runs on its own clock. If the ring and the sky drift a quarter
   of a second apart, the illusion that you are breathing with the world dies
   instantly. One number, one frame, one truth.
   ========================================================================== */

import { bus } from '../core/bus.js';
import { zen } from '../core/zen.js';
import { el, $, clamp, lerp, TAU, rgbCss } from '../core/util.js';

const SIZE = 260;

export function initZen() {
  const cv = el('canvas.zen__ring', { width: SIZE, height: SIZE, 'aria-hidden': 'true' });
  const g = cv.getContext('2d');

  const label = el('p.zen__label', { text: 'Breathe in' });
  const count = el('p.zen__count', { text: '4' });
  const cycles = el('p.zen__cycles', { text: '' });

  const exit = el('button.zen__exit', {
    type: 'button',
    text: 'leave  ·  esc',
    onclick: () => zen.stop(),
  });

  const root = el('div.zen', { id: 'zen', 'aria-hidden': 'true' }, [
    el('div.zen__stage', {}, [cv, el('div.zen__text', {}, [label, count])]),
    cycles,
    exit,
  ]);

  document.body.append(root);

  bus.on('zen', ({ active }) => {
    root.dataset.on = String(active);
    root.setAttribute('aria-hidden', String(!active));
    // Focus the exit button so a keyboard user isn't stranded in an overlay.
    if (active) setTimeout(() => exit.focus(), 300);
  });

  // Esc always leaves. Always.
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && zen.active) {
      e.preventDefault();
      zen.stop();
    }
  });

  bus.on('tick', () => {
    if (!zen.active) return;

    const b = zen.breath;
    const phase = zen.phase;

    if (label.textContent !== phase.label) label.textContent = phase.label;
    const secs = String(Math.ceil(zen.remaining));
    if (count.textContent !== secs) count.textContent = secs;

    const rounds = zen.cycles;
    const txt = rounds === 0 ? '' : `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
    if (cycles.textContent !== txt) cycles.textContent = txt;

    draw(g, b, phase, zen.phaseProgress);
  });
}

function draw(g, breath, phase, progress) {
  const c = SIZE / 2;
  g.clearRect(0, 0, SIZE, SIZE);

  const css = getComputedStyle(document.documentElement);
  const glow = css.getPropertyValue('--amb-glow').trim() || '#ffd479';
  const accent = css.getPropertyValue('--amb-accent').trim() || '#7fd6c2';
  const ink = css.getPropertyValue('--amb-ink-soft').trim() || '#9aa';

  /* The ring's radius IS the breath. It expands as you fill your lungs and
     contracts as you empty them — and during the HOLD it sits perfectly still at
     full size, which is the single most important frame in the whole animation.
     A guide that keeps drifting during the hold is telling you to keep inhaling. */
  const rMin = 44;
  const rMax = 104;
  const r = lerp(rMin, rMax, breath);

  // The outer track — where the ring will get to.
  g.strokeStyle = ink;
  g.globalAlpha = 0.18;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(c, c, rMax, 0, TAU);
  g.stroke();
  g.globalAlpha = 1;

  // The breathing ring, drawn as PIXEL BLOCKS around the circle rather than a
  // smooth stroke — it has to belong to the same world as everything else.
  const step = TAU / 96;
  const holding = phase.key === 'hold';
  g.fillStyle = holding ? glow : accent;

  for (let a = 0; a < TAU; a += step) {
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    g.globalAlpha = 0.55 + breath * 0.45;
    g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
  }
  g.globalAlpha = 1;

  // The progress arc: how far through the current phase. It starts at the top
  // and sweeps clockwise, so the ring is also a clock.
  g.strokeStyle = glow;
  g.lineWidth = 3;
  g.globalAlpha = 0.85;
  g.beginPath();
  g.arc(c, c, rMax + 8, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
  g.stroke();
  g.globalAlpha = 1;

  // A soft filled core that brightens as you fill.
  const grad = g.createRadialGradient(c, c, 0, c, c, r);
  grad.addColorStop(0, hexA(glow, 0.16 * breath + 0.04));
  grad.addColorStop(1, hexA(glow, 0));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(c, c, r, 0, TAU);
  g.fill();
}

/** '#rrggbb' + alpha → 'rgba(...)'. The tokens are hex; canvas wants alpha. */
function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
