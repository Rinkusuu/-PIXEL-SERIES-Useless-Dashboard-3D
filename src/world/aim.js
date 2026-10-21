/* ============================================================================
   aim.js — what the centre dot is pointing at, for things that aren't meshes:
   a star, a falling leaf, a shooting star. Pure, so it can be tested.
   ========================================================================== */

/**
 * The index of the direction closest to `forward` within `maxDeg`, or -1.
 * `dirs` is an array of unit vectors {x, y, z} (or anything with those fields).
 * `ok(i)` can veto a candidate (below the horizon, already caught…).
 */
export function aimPick(forward, dirs, maxDeg, ok = () => true) {
  const minDot = Math.cos((maxDeg * Math.PI) / 180);
  let best = -1;
  let bestDot = minDot;
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    const dot = forward.x * d.x + forward.y * d.y + forward.z * d.z;
    if (dot > bestDot && ok(i)) {
      bestDot = dot;
      best = i;
    }
  }
  return best;
}

/** Where a cast lands: `charge` 0–1 throws it 3 to 16 m ahead along `yaw` (0 = north, −z). */
export function castPoint(x, z, yaw, charge) {
  const d = 3 + 13 * Math.max(0, Math.min(1, charge));
  return { x: x - Math.sin(yaw) * d, z: z - Math.cos(yaw) * d, d };
}
