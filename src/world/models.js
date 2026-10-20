/* ============================================================================
   models.js — small voxel models that are built once and used many times:
   trees, rocks, grass tufts, lamp posts. Each returns a VoxelGrid in its own
   local space (origin at the base, centred on x/z), so callers can instance
   or place them freely.
   ========================================================================== */

import { BufferAttribute } from 'three';
import { VoxelGrid, color, grain, mesh } from './voxel.js';
import { noise2, rng } from '../core/util.js';

/** A pine: a trunk and three stacked, slightly ragged cones of needles. */
export function pine(seed = 1, s = 0.25) {
  const g = new VoxelGrid([-2, 0, -2], [2, 6.5, 2], s);
  const r = rng(seed);
  g.fillBox(-0.25, 0, -0.25, 0.25, 2.2, 0.25, grain('#7a5a40', 0.5));
  const needles = [grain('#3f7a52', 0.6), grain('#468658', 0.6), grain('#4f9160', 0.6)];
  const tiers = [[1.4, 1.9, 2.9], [2.7, 1.45, 2.4], [3.9, 1.0, 2.2]];
  tiers.forEach(([base, rad, h], t) => {
    g.fill([-2, base, -2], [2, base + h, 2], (x, y, z) => {
      const k = 1 - (y - base) / h;
      const ragged = rad * k * (0.85 + 0.3 * noise2(x * 2 + seed, z * 2 + y, 7));
      return Math.hypot(x, z) < ragged;
    }, needles[t]);
  });
  // A tip.
  g.fillBox(-s / 2, 5.9, -s / 2, s / 2, 6.3 + r() * 0.2, s / 2, needles[2]);
  return g;
}

/** A round tree: trunk, a lumpy crown of leaves. */
export function roundTree(seed = 2, s = 0.25) {
  const g = new VoxelGrid([-2.5, 0, -2.5], [2.5, 6, 2.5], s);
  g.fillBox(-0.25, 0, -0.25, 0.25, 3.2, 0.25, grain('#7a5a40', 0.5));
  const leaves = grain('#5a9a4e', 0.8);
  for (const [cx, cy, cz, rad] of [[0, 3.6, 0, 1.9], [0.7, 4.5, 0.3, 1.3], [-0.6, 4.3, -0.5, 1.2]]) {
    g.fill([cx - rad, cy - rad, cz - rad], [cx + rad, cy + rad, cz + rad], (x, y, z) => {
      const d = Math.hypot(x - cx, (y - cy) * 1.15, z - cz);
      return d < rad * (0.82 + 0.3 * noise2(x * 1.7 + seed, z * 1.7 + y * 0.9, 13));
    }, leaves);
  }
  return g;
}

/** A boulder: a squashed, noisy ball of stone. */
export function rock(radius, seed = 3, size = 0.2) {
  const g = new VoxelGrid([-radius, 0, -radius], [radius, radius, radius], size);
  const rand = rng(seed);
  const sx = 0.8 + rand() * 0.4;
  const sz = 0.8 + rand() * 0.4;
  g.fill([-radius, 0, -radius], [radius, radius, radius], (x, y, z) => {
    const d = Math.hypot(x / sx, y / 0.6, z / sz);
    return d < radius * (0.8 + 0.25 * noise2(x * 2 + seed, z * 2 + y, 21));
  }, grain('#8d8d96', 0.8));
  return g;
}

/** A grass tuft: four thin stalks of different heights, 4 cm voxels. */
export function tuftGeometry() {
  const s = 0.04;
  const g = new VoxelGrid([-0.16, 0, -0.16], [0.16, 0.6, 0.16], s);
  const r = rng(5);
  const greens = [color('#4f8a3e'), color('#6ea84e'), color('#9ccc6a')];
  for (let k = 0; k < 4; k++) {
    const x = (Math.floor(r() * 8) - 4) * s;
    const z = (Math.floor(r() * 8) - 4) * s;
    const h = 0.24 + r() * 0.3;
    // One colour per stalk: a gradient up each one broke the greedy merge and tripled the triangles.
    g.fillBox(x, 0, z, x + s, h, z + s, greens[k % 3]);
  }
  const geo = mesh(g);
  // uv.y = how far up the stalk, for the wind shader (it bends the tips, not the roots).
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) uv[i * 2 + 1] = Math.min(1, p.getY(i) / 0.5);
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  // Up-facing normals: a tuft takes the ground's light instead of glittering.
  geo.attributes.normal.array.fill(0);
  for (let i = 0; i < p.count; i++) geo.attributes.normal.array[i * 3 + 1] = 1;
  return geo;
}

/** A lamp post: a dark pole and a lantern box on top. The light itself is a PointLight. */
export function lampPost() {
  const g = new VoxelGrid([-0.3, 0, -0.3], [0.3, 3, 0.3], 0.1);
  const iron = grain('#3a3a44', 0.3);
  g.fillBox(-0.1, 0, -0.1, 0.1, 2.5, 0.1, iron);
  g.fillBox(-0.2, 2.5, -0.2, 0.2, 2.6, 0.2, iron);
  g.fillBox(-0.2, 2.9, -0.2, 0.2, 3.0, 0.2, iron);
  return g;
}

export const LAMP_GLASS = { y0: 2.6, y1: 2.9, half: 0.17 }; // the lantern glass, lit from inside
