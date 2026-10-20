/* ============================================================================
   stars.js — facts about the fixed star field that outlive any one renderer.

   A constellation is saved as star INDICES, so the count is part of the data
   format: the store's migration validates against it, the classic layer draws
   exactly this many, and the 3D sky will too.
   ========================================================================== */

export const STAR_COUNT = 190;
