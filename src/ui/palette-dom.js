/* ============================================================================
   palette-dom.js — the one place the sky's palette touches the DOM.

   Split out of sky/palette.js so that file stays pure (no DOM, no three) and
   can be tested in node. Both the classic scene and the 3D world call this.
   ========================================================================== */

import { mixRgb, rgbToHex } from '../core/util.js';

/**
 * Push the palette into CSS custom properties so the glass panels, the buttons
 * and the text all inherit the sky's mood. Called ~4×/s, not every frame —
 * writing custom properties invalidates style for the whole subtree, and no
 * human can see a colour move faster than that anyway.
 */
export function applyPaletteToDOM(pal) {
  const r = document.documentElement.style;

  /* The panels are dark frosted glass at EVERY hour — that's the art direction
     (dark UI plates floating over a bright world, the way Hyper Light Drifter
     and Sea of Stars do it). So the job here is to carry the sky's HUE into the
     chrome while forcing its LIGHTNESS down to a level that white text can
     always sit on.

     We derive from sky[1] (the middle band) rather than sky[0] (the zenith),
     because the zenith goes almost achromatic at midnight and we'd lose the
     tint entirely. Mixing 72% toward near-black keeps dawn peach-dark, noon
     navy-dark and midnight ink-dark — visibly different, uniformly legible. */
  const INK_BLACK = [8, 8, 16];
  const base = pal.sky[1];

  const deep = mixRgb(base, INK_BLACK, 0.72);
  // A breath of the key light so the glass warms up at golden hour.
  const deepTinted = mixRgb(deep, pal.glow, 0.06);

  r.setProperty('--amb-deep', rgbToHex(deepTinted));
  r.setProperty('--amb-mid', rgbToHex(mixRgb(base, INK_BLACK, 0.42)));
  r.setProperty('--amb-lift', rgbToHex(mixRgb(mixRgb(base, INK_BLACK, 0.3), pal.glow, 0.22)));
  r.setProperty('--amb-glow', rgbToHex(pal.glow));
  r.setProperty('--amb-accent', rgbToHex(pal.accent));
  r.setProperty('--amb-ink', rgbToHex(pal.ink));
  r.setProperty('--amb-ink-soft', rgbToHex(pal.inkSoft));
  r.setProperty('--amb-lum', pal.lum.toFixed(3));
}
