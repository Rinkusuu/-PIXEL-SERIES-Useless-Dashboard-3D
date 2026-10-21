/* ============================================================================
   tabcycle.js — keyboard access to the world (spec §8): Tab walks through the
   things you could use from here, left to right, as a sighted player's eye
   would; Shift+Tab goes back. Pure, so it can be tested.
   ========================================================================== */

export const TAB_REACH = 8; // metres (the world narrows this to what you can actually use from here)

/**
 * Order candidates { x, z, ... } within reach by their bearing relative to
 * where you face, from your left to your right. Things behind you come last.
 */
export function orderByBearing(items, pos, yaw, reach = TAB_REACH) {
  return items
    .map((it) => {
      const dx = it.x - pos.x;
      const dz = it.z - pos.z;
      const dist = Math.hypot(dx, dz);
      // Bearing relative to facing: 0 ahead, negative to the left, positive to the right.
      let rel = Math.atan2(-dx, -dz) - yaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      return { it, dist, rel: -rel };
    })
    .filter((c) => c.dist <= reach)
    .sort((a, b) => a.rel - b.rel)
    .map((c) => c.it);
}

/** The next index in a list of `n`, from `current` (−1 = none yet), wrapping. */
export const step = (current, n, back) => (n === 0 ? -1 : current < 0 ? (back ? n - 1 : 0) : (current + (back ? -1 : 1) + n) % n);
