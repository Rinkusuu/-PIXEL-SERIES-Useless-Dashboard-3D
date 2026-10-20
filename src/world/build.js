/* ============================================================================
   build.js — the handful of helpers every hand-built thing in the world uses.

   A box given by its two corners (that is how a carpenter thinks), with UVs
   scaled to metres so a plank texture is the same size on a door as on a
   floor; and a small cache of materials, so forty boxes of oak are one
   material and not forty.
   ========================================================================== */

import { BoxGeometry, Mesh, MeshLambertMaterial, MeshBasicMaterial } from 'three';
import { texture } from './textures.js';

const mats = new Map();

/** A lit material by name: 'wood:#9a6a44', 'stone', or a bare hex for an untextured one. */
export function mat(spec) {
  if (mats.has(spec)) return mats.get(spec);
  const [tex, hex] = spec.includes(':') ? spec.split(':') : spec.startsWith('#') ? [null, spec] : [spec, '#ffffff'];
  const m = new MeshLambertMaterial({ color: hex, map: tex ? texture(tex) : null });
  mats.set(spec, m);
  return m;
}

/** An unlit material: things that glow, or panes of glass. Not cached; callers recolour it. */
export const basic = (hex) => new MeshBasicMaterial({ color: hex });

/**
 * A box from (x0, y0, z0) to (x1, y1, z1). Casts and receives shadow.
 * `tile` metres per texture repeat.
 */
export function boxAt(x0, y0, z0, x1, y1, z1, material, tile = 1) {
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  const d = Math.abs(z1 - z0);
  const g = new BoxGeometry(w, h, d);

  // BoxGeometry's faces: +x, −x, +y, −y, +z, −z, four vertices each.
  const uv = g.attributes.uv;
  const size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * size[f][0]) / tile, (uv.getY(i) * size[f][1]) / tile);
    }
  }

  const m = new Mesh(g, material);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
