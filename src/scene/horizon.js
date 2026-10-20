/* ============================================================================
   horizon.js — where the world's ground meets its water.

   These numbers used to live as magic fractions inside five different layers:
   the water drew itself between 0.558 and 0.68, the weather layer independently
   believed the lake was between 0.558 and 0.68 (so it knew where raindrops
   should make rings), the forest stood at 0.555, the meadow began at 0.675, and
   the critters and the pet each had their own idea of where the grass was.

   Five copies of one fact. Widen the lake in one of them and the rain starts
   landing on the grass.

   So: ONE function. Everything that needs to know where the shoreline is asks
   here, and because the rounding happens once, the layers agree to the pixel —
   two layers rounding the same fraction independently is how you get a 1px seam
   of sky glowing between the water and the bank.
   ========================================================================== */

/**
 * @param {number} H — the scene buffer's height, in chunky logical pixels.
 */
export function horizon(H) {
  /* The lake is the centrepiece. It used to be 12% of the frame — a blue stripe
     you could miss — and everything interesting about water (the reflection, the
     glitter path, the depth) needs vertical room to happen in. It now takes
     nearly a quarter of the world, and the meadow gives up the space. */
  const waterTop = Math.round(H * 0.548);
  const waterBot = Math.round(H * 0.775);

  // The far bank the forest stands on, one pixel above the waterline.
  const shoreY = waterTop - 1;

  // The near bank's lip overlaps the water, so the grass grows over the edge
  // instead of stopping at a ruled line.
  const meadowTop = waterBot - 2;

  const grass = H - meadowTop; // the meadow's full depth

  return {
    shoreY,
    waterTop,
    waterBot,
    meadowTop,

    /* The SKY's horizon, which is not the water's. It sits behind the mountains,
       and it is the line the sun rises out of, the moon sets into, and now the
       line the planets climb from. It was a bare 0.52 inside CelestialLayer
       until something else needed to agree with it — which is the exact story
       this file exists to prevent a second time. */
    skyline: Math.round(H * 0.52),

    /* The critters roam the near bank. Their ceiling sits a little above the
       grass line so a butterfly can cross the water's edge. */
    critterTop: meadowTop - 4,

    /* The pet's paddock, expressed as a fraction of the MEADOW — not of the
       screen. Tune the lake and the slime stays in the grass where it belongs,
       instead of wading in. */
    petTop: meadowTop + Math.round(grass * 0.17),
    petBot: meadowTop + Math.round(grass * 0.75),
  };
}
