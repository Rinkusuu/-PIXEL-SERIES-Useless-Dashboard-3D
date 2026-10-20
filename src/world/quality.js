/* ============================================================================
   quality.js — three tiers, and the rule for picking one.

   Every expensive thing in the world has a knob here and nowhere else:
   internal resolution, grass and tree counts, fog distance, the lake's
   reflection, shadows, bloom and point lights. The world starts on a guess
   (desktop: high, touch: medium) and steps down if the first seconds are slow.
   ========================================================================== */

export const TIERS = {
  low: { name: 'low', rows: 240, grass: 0.15, trees: 0.4, fogFar: 140, reflect: 0, shadows: 0, bloom: false, points: 1 },
  medium: { name: 'medium', rows: 300, grass: 0.45, trees: 0.7, fogFar: 185, reflect: 0.5, shadows: 1024, bloom: true, points: 3 },
  high: { name: 'high', rows: 360, grass: 1, trees: 1, fogFar: 230, reflect: 1, shadows: 2048, bloom: true, points: 3 },
};

export const ORDER = ['low', 'medium', 'high'];

/** The tier to start on: the user's choice, or a guess from the device. */
export function initialTier(choice, coarsePointer) {
  if (TIERS[choice]) return choice;
  return coarsePointer ? 'medium' : 'high';
}

/**
 * Given the median frame time over a probe window, the tier to move to.
 * Desktop aims for 60 fps and touch for 30, so "slow" is relative to that.
 * Only ever steps DOWN: a tier that flickers up and down is worse than
 * either tier held still.
 */
export function nextTier(current, medianMs, coarsePointer) {
  const budget = coarsePointer ? 1000 / 30 : 1000 / 60;
  const i = ORDER.indexOf(current);
  if (medianMs > budget * 1.25 && i > 0) return ORDER[i - 1];
  return current;
}
