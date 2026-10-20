/* ============================================================================
   MoodWidget — a mood meter you can drag, which changes absolutely nothing.

   Two real ideas:

   1. The mood DRIFTS. Left alone, it wanders slowly back toward a contented
      60-ish, because that's what moods do. You can drag it to 100 but it won't
      stay there, and it won't stay at 0 either. That slow return is what makes
      a slider feel like a living thing instead of a form control.

   2. The face is a PIXEL FACE, drawn on canvas, and it MORPHS. It isn't seven
      emoji swapped out at thresholds — the mouth is a parabola whose curvature
      is a continuous function of the value, so it bends smoothly from a frown
      through a flat line into a grin, and the skin lerps from a cold slate-blue
      to a warm gold along the way. Emoji would have been three lines of code and
      would have snapped between discrete states; you'd feel the steps.
   ========================================================================== */

import { Widget } from './Widget.js';
import { bus } from '../core/bus.js';
import { store } from '../core/store.js';
import { el, clamp, damp, lerp, mixRgb, hexToRgb, rgbCss, remap } from '../core/util.js';
import { pxCircle } from '../scene/pixel.js';

const S = 40; // the face is drawn in a 40×40 buffer and upscaled. Chunky on purpose.

const WORDS = [
  { at: 0, word: 'bleak' },
  { at: 15, word: 'low' },
  { at: 32, word: 'flat' },
  { at: 48, word: 'okay' },
  { at: 64, word: 'content' },
  { at: 78, word: 'good' },
  { at: 90, word: 'radiant' },
];

// The skin ramp. Cold and desaturated at the bottom, warm and luminous at the top.
const COLD = hexToRgb('#6a7a9c');
const MID = hexToRgb('#e8c96a');
const WARM = hexToRgb('#ffd479');

const INK = '#241d3a';
const BASELINE = 62; // where a mood goes when nothing is happening to it

export class MoodWidget extends Widget {
  constructor() {
    super({ title: 'Mood', icon: '🌈', float: false, className: 'w-mood' });

    this.value = store.get('mood');
    this.display = this.value;
    this.saved = this.value; // what's actually in the store
    this.blink = 3;
    this.bob = 0;
  }

  body() {
    this.cv = el('canvas.mood__cv', {
      width: S,
      height: S,
      role: 'img',
      'aria-label': 'A pixel face showing your mood',
    });
    this.g = this.cv.getContext('2d');
    this.g.imageSmoothingEnabled = false;

    this.word = el('div.mood__word');

    this.slider = el('input.mood__slider', {
      type: 'range',
      min: '0',
      max: '100',
      value: String(Math.round(this.value)),
      'aria-label': 'How are you, on a scale of nothing to nothing',
      oninput: (e) => {
        this.value = Number(e.target.value);
        this._persist();
        bus.emit('sfx', 'hover');
      },
    });

    this.note = el('p.mood__note', { text: 'this affects nothing. that is the point.' });

    return el('div.mood', {}, [
      el('div.mood__read', {}, [this.cv, this.word]),
      this.slider,
      this.note,
    ]);
  }

  /* The drift is asymptotic: it never arrives, it just keeps nudging by
     fractions of a point, forever. Persisting each of those nudges meant a
     store write on EVERY FRAME — which starved the store's debounce and stopped
     the whole app from saving anything at all until the tab closed.

     A mood is worth saving when it has visibly moved. Half a point is already
     finer than the number anyone can read off the face. */
  _persist() {
    if (Math.abs(this.value - this.saved) < 0.5) return;
    this.saved = this.value;
    store.set('mood', this.value);
  }

  tick({ dt, t }) {
    // Drift home. 0.045/sec ≈ halfway back in ~15 seconds — slow enough that you
    // don't catch it moving, fast enough that you notice it has.
    if (document.activeElement !== this.slider) {
      this.value = damp(this.value, BASELINE, 0.045, dt);
      this._persist();
      this.slider.value = String(Math.round(this.value));
    }

    // The face LAGS the slider slightly, so it feels attached rather than bound.
    this.display = damp(this.display, this.value, 9, dt);

    // Happier moods bob faster and higher. A radiant face should not sit still.
    const energy = this.display / 100;
    this.bob = Math.sin(t * (1.2 + energy * 1.6)) * (0.5 + energy * 1.6);

    this.blink -= dt;
    if (this.blink < -0.12) this.blink = 2.4 + Math.random() * 3.6;

    this._paintWord();
    this._draw(t);
  }

  _paintWord() {
    const v = this.display;
    let w = WORDS[0].word;
    for (const x of WORDS) if (v >= x.at) w = x.word;
    if (this.word.textContent !== w) this.word.textContent = w;

    // Drives the glow strength in CSS — a happy panel literally glows harder.
    this.root.style.setProperty('--mood', (v / 100).toFixed(3));
  }

  _draw(t) {
    const g = this.g;
    g.clearRect(0, 0, S, S);

    const v = clamp(this.display, 0, 100) / 100;
    const cx = S / 2;
    const cy = S / 2 + (this.bob | 0);
    const r = 15;

    // ── Skin ────────────────────────────────────────────────────────────────
    // Two-stop ramp: cold slate → gold. A single lerp from blue to yellow would
    // pass through a muddy grey-green at the midpoint, which reads as "ill".
    const skin = v < 0.5 ? mixRgb(COLD, MID, v * 2) : mixRgb(MID, WARM, (v - 0.5) * 2);
    const shade = mixRgb(skin, [40, 30, 60], 0.35);
    const light = mixRgb(skin, [255, 255, 255], 0.4);

    // Body, then a crescent of shadow at the bottom, then a highlight at the top
    // left. Three tones is all a pixel face ever needs to read as a sphere.
    pxCircle(g, cx, cy, r, rgbCss(shade));
    pxCircle(g, cx, cy - 1, r - 1, rgbCss(skin));
    pxCircle(g, cx - 3, cy - 4, r - 7, rgbCss(light));

    // ── Eyes ────────────────────────────────────────────────────────────────
    const eyeY = cy - 4;
    const eyeL = cx - 6;
    const eyeR = cx + 3;
    const blinking = this.blink < 0;

    g.fillStyle = INK;

    if (blinking) {
      g.fillRect(eyeL, eyeY + 1, 3, 1);
      g.fillRect(eyeR, eyeY + 1, 3, 1);
    } else if (v > 0.86) {
      // Radiant: ^ ^ — the universal pixel-art "delighted".
      for (const x of [eyeL, eyeR]) {
        g.fillRect(x + 1, eyeY, 1, 1);
        g.fillRect(x, eyeY + 1, 1, 1);
        g.fillRect(x + 2, eyeY + 1, 1, 1);
      }
    } else {
      // Normal eyes. They DROOP as the mood falls: the lid comes down from the
      // top and the whole eye sinks a pixel. That droop is doing more work here
      // than the mouth is.
      const droop = v < 0.35 ? 1 : 0;
      for (const x of [eyeL, eyeR]) {
        g.fillRect(x, eyeY + droop, 3, 3 - droop);
        // Catchlight. Two white pixels: the entire difference between "alive"
        // and "taxidermy". They fade out as the mood bottoms out.
        if (v > 0.22) {
          g.fillStyle = 'rgba(255,255,255,.85)';
          g.fillRect(x + 2, eyeY + droop, 1, 1);
          g.fillStyle = INK;
        }
      }

      // Worried brows, only at the bottom of the range.
      if (v < 0.3) {
        const a = remap(v, 0.3, 0, 0, 1);
        g.globalAlpha = a;
        g.fillRect(eyeL, eyeY - 3, 3, 1);
        g.fillRect(eyeR, eyeY - 3, 3, 1);
        g.globalAlpha = 1;
      }
    }

    /* ── Mouth ────────────────────────────────────────────────────────────────
       A parabola: y = base + k·(1 − (x/w)²)

       k is the curvature, mapped continuously from the mood: −1 is a full frown,
       0 is a flat line, +1 is a grin. At the centre (x = 0) the term is 1, so the
       middle of the mouth drops by k; at the corners (x = ±w) it's 0, so they
       stay put. Positive k therefore pulls the centre DOWN relative to the
       corners — which is a smile. This is the whole reason the face morphs
       instead of stepping between poses. */
    const k = (v - 0.5) * 2 * 4.2; // ±4.2px of curve at full deflection
    const w = 5;
    const mouthY = cy + 5;

    g.fillStyle = INK;
    for (let x = -w; x <= w; x++) {
      const f = 1 - (x / w) ** 2;
      const y = Math.round(mouthY + k * f - k * 0.5);
      g.fillRect(cx + x, y, 1, 1);
      // Thicken a broad grin so it reads at a glance.
      if (v > 0.7 && Math.abs(x) < w - 1) g.fillRect(cx + x, y + 1, 1, 1);
    }

    // Blush, for the genuinely happy.
    if (v > 0.75) {
      g.globalAlpha = remap(v, 0.75, 1, 0, 0.5);
      g.fillStyle = '#ff8fa3';
      g.fillRect(cx - 12, cy + 2, 3, 2);
      g.fillRect(cx + 9, cy + 2, 3, 2);
      g.globalAlpha = 1;
    }
  }
}
