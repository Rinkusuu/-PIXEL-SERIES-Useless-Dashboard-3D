/* ============================================================================
   stars.js — facts about the fixed star field that outlive any one renderer.

   A constellation is saved as star INDICES, so the count is part of the data
   format: the store's migration validates against it, the classic layer draws
   exactly this many, and the 3D sky will too.
   ========================================================================== */

import { rng } from '../core/util.js';

export const STAR_COUNT = 190;

export const STAR_SEED = 20260713;

/**
 * The star field as directions in the sky. It consumes the seed in EXACTLY the
 * order classic/layers/StarsLayer.js does (size, x, y, base, speed, phase,
 * warm), so star #57 is the same star in both worlds and a constellation saved
 * in one is drawn between the same two stars in the other. Classic's x across
 * the screen becomes azimuth; its y down from the top becomes altitude, still
 * crowded toward the zenith.
 */
export function starField() {
  const r = rng(STAR_SEED);
  return Array.from({ length: STAR_COUNT }, () => {
    const size = r() > 0.93 ? 2 : 1;
    const x = r();
    const y = Math.pow(r(), 1.7);
    return {
      size,
      az: x * 360,
      alt: 6 + (1 - y) * 84,
      base: 0.35 + r() * 0.65,
      speed: 0.6 + r() * 2.4,
      phase: r() * Math.PI * 2,
      warm: r() > 0.7,
    };
  });
}
