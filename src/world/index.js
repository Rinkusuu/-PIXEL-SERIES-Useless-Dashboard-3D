/* ============================================================================
   world/ — the walkable 3D world. Loaded lazily by main.js, only in 3D mode.

   P1 stage: an empty WebGL2 canvas painted in the palette's horizon colour, so
   the mode switch, the lazy chunk and the shared environment are proven before
   there is anything to walk on. The renderer proper arrives in P2.
   ========================================================================== */

import { bus } from '../core/bus.js';
import { env } from '../core/env.js';

export function startWorld(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) throw new Error('WebGL2 context refused');

  bus.on('tick', (tick) => {
    const { pal } = env.update(tick);
    const [r, g, b] = pal.sky[1];
    gl.clearColor(r / 255, g / 255, b / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  });
}
