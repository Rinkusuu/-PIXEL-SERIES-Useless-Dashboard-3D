/* ============================================================================
   yard.js — the yard round the cabin, lived in.

   A picket fence with a gate where the path goes out; vegetable beds with a
   scarecrow; a little greenhouse with seedlings on its shelves; a stone well
   with a bucket on a rope; logs stacked by a chopping block with the axe still
   in it; a handcart with sacks; washing on a line. Small voxel clusters, each
   in its own grid, baked into one mesh (plus one for the greenhouse glass).
   ========================================================================== */

import { DoubleSide, Mesh, MeshBasicMaterial } from 'three';
import { PLACES, blockHeight } from './layout.js';
import { VoxelGrid, bake, color, grain, voxelMesh } from './voxel.js';
import { rng } from '../core/util.js';

const WOOD = grain('#9a6a44', 0.4);
const DARK = grain('#5e4030', 0.4);
const PALE = grain('#d8ccb4', 0.3); // whitewashed fence
const STONE = grain('#8d8d96', 0.7);

function cluster(min, max, size, build) {
  const g = new VoxelGrid(min, max, size);
  build(g);
  return voxelMesh(g);
}

export function buildYard(col) {
  const parts = [];
  const add = (m) => parts.push(m);
  const Y = PLACES.yard;

  // ── The fence: posts every 2 m, two rails, pickets; the gate is a gap ──
  const run = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2));
    for (let k = 0; k < n; k++) {
      const x0 = ax + ((bx - ax) * k) / n;
      const z0 = az + ((bz - az) * k) / n;
      const x1 = ax + ((bx - ax) * (k + 1)) / n;
      const z1 = az + ((bz - az) * (k + 1)) / n;
      if (az === bz && az === Y.z0 && Math.max(x0, x1) > Y.gate[0] && Math.min(x0, x1) < Y.gate[1]) continue;
      const h0 = blockHeight(x0, z0);
      const h1 = blockHeight(x1, z1);
      const lo = Math.min(h0, h1) - 0.2;
      add(cluster([Math.min(x0, x1) - 0.1, lo, Math.min(z0, z1) - 0.1], [Math.max(x0, x1) + 0.1, Math.max(h0, h1) + 1.1, Math.max(z0, z1) + 0.1], 0.05, (g) => {
        const along = (px, pz) => (Math.abs(x1 - x0) > Math.abs(z1 - z0) ? (px - x0) / (x1 - x0) : (pz - z0) / (z1 - z0));
        const ground = (px, pz) => h0 + (h1 - h0) * Math.min(1, Math.max(0, along(px, pz)));
        g.fillBox(x0 - 0.06, h0 - 0.2, z0 - 0.06, x0 + 0.06, h0 + 1.0, z0 + 0.06, DARK); // post
        // Rails and pickets follow the ground between the posts.
        g.fill([Math.min(x0, x1), lo, Math.min(z0, z1) - 0.04], [Math.max(x0, x1), Math.max(h0, h1) + 1.0, Math.max(z0, z1) + 0.04], (px, py, pz) => {
          const t = along(px, pz);
          if (t < 0 || t > 1) return false;
          const y = py - ground(px, pz);
          const rail = Math.abs(y - 0.35) < 0.04 || Math.abs(y - 0.75) < 0.04;
          const picket = Math.floor(t * (len / n) / 0.15) % 2 === 0 && y > 0 && y < 0.92 - (Math.floor(t * (len / n) / 0.15) % 4 === 0 ? 0 : 0.06);
          return rail || picket;
        }, PALE);
      }));
      col.addSeg(x0, z0, x1, z1, -Infinity, Math.max(h0, h1) + 1);
    }
  };
  run(Y.x0, Y.z0, Y.gate[0], Y.z0);
  run(Y.gate[1], Y.z0, Y.x1, Y.z0);
  run(Y.x1, Y.z0, Y.x1, Y.z1);
  run(Y.x1, Y.z1, Y.x0, Y.z1);
  run(Y.x0, Y.z1, Y.x0, Y.z0);

  // ── The vegetable garden: three raised beds, a scarecrow ──
  const G = PLACES.garden;
  const gy = blockHeight((G.x0 + G.x1) / 2, (G.z0 + G.z1) / 2);
  const r = rng(303);
  add(cluster([G.x0, gy - 0.3, G.z0], [G.x1, gy + 1.0, G.z1], 0.05, (g) => {
    const beds = [[G.z0 + 0.3, G.z0 + 2.1, 'cabbage'], [G.z0 + 2.8, G.z0 + 4.6, 'carrot'], [G.z0 + 5.3, G.z1 - 0.3, 'tomato']];
    for (const [za, zb, crop] of beds) {
      g.fillBox(G.x0 + 0.3, gy - 0.3, za, G.x1 - 0.3, gy + 0.25, zb, WOOD); // the bed's frame
      g.fillBox(G.x0 + 0.4, gy - 0.3, za + 0.1, G.x1 - 0.4, gy + 0.22, zb - 0.1, grain('#5a4030', 0.7)); // soil
      for (let x = G.x0 + 0.8; x < G.x1 - 0.6; x += 0.55) {
        for (let z = za + 0.45; z < zb - 0.3; z += 0.6) {
          if (crop === 'cabbage') {
            g.fill([x - 0.2, gy + 0.2, z - 0.2], [x + 0.2, gy + 0.55, z + 0.2], (px, py, pz) => Math.hypot(px - x, (py - gy - 0.32) * 1.3, pz - z) < 0.17, grain('#7ab05a', 0.6));
          } else if (crop === 'carrot') {
            for (let k = 0; k < 4; k++) g.fillBox(x - 0.1 + k * 0.06, gy + 0.22, z - 0.025, x - 0.05 + k * 0.06, gy + 0.35 + r() * 0.15, z + 0.025, color('#5a9a3a'));
            g.fillBox(x - 0.025, gy + 0.2, z - 0.025, x + 0.025, gy + 0.25, z + 0.025, color('#e07a2a')); // a shoulder of carrot showing
          } else {
            g.fillBox(x - 0.025, gy + 0.22, z - 0.025, x + 0.025, gy + 0.95, z + 0.025, color('#a0804a')); // stake
            g.fill([x - 0.2, gy + 0.3, z - 0.2], [x + 0.2, gy + 0.9, z + 0.2], (px, py, pz) => Math.hypot(px - x, pz - z) < 0.15 && ((Math.floor(py * 20) + Math.floor(px * 20)) % 3 !== 0), grain('#4a8a3a', 0.6));
            for (let k = 0; k < 3; k++) g.fillBox(x - 0.15 + r() * 0.25, gy + 0.4 + r() * 0.4, z - 0.15 + r() * 0.25, x - 0.1 + r() * 0.25, gy + 0.45 + r() * 0.4, z - 0.1 + r() * 0.25, color('#d0402a'));
          }
        }
      }
    }
  }));
  // The scarecrow, at the garden's west end.
  const sx = G.x0 - 0.6;
  const sz = (G.z0 + G.z1) / 2;
  const sy = blockHeight(sx, sz);
  add(cluster([sx - 0.8, sy, sz - 0.3], [sx + 0.8, sy + 2.2, sz + 0.3], 0.05, (g) => {
    g.fillBox(sx - 0.05, sy, sz - 0.05, sx + 0.05, sy + 1.9, sz + 0.05, DARK);
    g.fillBox(sx - 0.7, sy + 1.4, sz - 0.04, sx + 0.7, sy + 1.48, sz + 0.04, DARK); // arms
    g.fillBox(sx - 0.3, sy + 0.9, sz - 0.15, sx + 0.3, sy + 1.55, sz + 0.15, (i, j) => color(j % 4 < 2 ? '#a83a3a' : '#7a2a2a')); // a checked shirt
    g.fillBox(sx - 0.25, sy + 1.55, sz - 0.12, sx + 0.25, sy + 1.62, sz + 0.12, color('#d8b860')); // straw collar
    g.fill([sx - 0.2, sy + 1.62, sz - 0.2], [sx + 0.2, sy + 1.95, sz + 0.2], (px, py, pz) => Math.hypot(px - sx, py - sy - 1.78, pz - sz) < 0.16, color('#e8d8a8')); // a sack head
    g.fillBox(sx - 0.3, sy + 1.92, sz - 0.3, sx + 0.3, sy + 1.96, sz + 0.3, color('#c8a050')); // hat brim
    g.fillBox(sx - 0.16, sy + 1.96, sz - 0.16, sx + 0.16, sy + 2.15, sz + 0.16, color('#c8a050'));
  }));
  col.addCircle(sx, sz, 0.3);

  // ── The greenhouse: a timber frame, glass, shelves of seedlings ──
  const H = PLACES.greenhouse;
  const hy = blockHeight((H.x0 + H.x1) / 2, (H.z0 + H.z1) / 2);
  const hTop = hy + 2.1;
  const ridge = hy + 2.9;
  const midx = (H.x0 + H.x1) / 2;
  const roofY = (px) => hTop + (ridge - hTop) * (1 - Math.abs(px - midx) / ((H.x1 - H.x0) / 2));
  add(cluster([H.x0 - 0.1, hy - 0.2, H.z0 - 0.1], [H.x1 + 0.1, ridge + 0.1, H.z1 + 0.1], 0.05, (g) => {
    g.fillBox(H.x0, hy - 0.2, H.z0, H.x1, hy + 0.3, H.z1, grain('#a8a8b0', 0.5)); // brick-ish base wall…
    g.fillBox(H.x0 + 0.1, hy - 0.2, H.z0 + 0.1, H.x1 - 0.1, hy + 0.3, H.z1 - 0.1, 0); // …hollow
    g.fillBox(H.x0 + 0.1, hy - 0.2, H.z0 + 0.1, H.x1 - 0.1, hy + 0.05, H.z1 - 0.1, grain('#7a6a58', 0.5)); // gravel floor
    g.fillBox(midx - 0.5, hy + 0.05, H.z0, midx + 0.5, hy + 0.3, H.z0 + 0.1, 0); // a doorway in the base, north side
    // The frame: corner posts, glazing bars every 0.75 m, ridge.
    for (let x = H.x0; x <= H.x1 + 0.01; x += (H.x1 - H.x0) / 6) {
      for (const z of [H.z0, H.z1 - 0.05]) g.fill([x - 0.05, hy, z], [x + 0.05, ridge, z + 0.05], (px, py) => py < roofY(px), WOOD);
    }
    for (let z = H.z0; z <= H.z1 + 0.01; z += (H.z1 - H.z0) / 5) {
      for (const x of [H.x0, H.x1 - 0.05]) g.fillBox(x, hy, z - 0.025, x + 0.05, hTop, z + 0.025, WOOD);
      g.fill([H.x0, hTop, z - 0.025], [H.x1, ridge + 0.05, z + 0.025], (px, py) => Math.abs(py - roofY(px)) < 0.05, WOOD); // rafters
    }
    g.fillBox(midx - 0.05, ridge - 0.05, H.z0, midx + 0.05, ridge + 0.05, H.z1, WOOD); // the ridge
    // Shelves along both long sides, pots of seedlings on them.
    for (const x of [H.x0 + 0.15, H.x1 - 0.65]) {
      g.fillBox(x, hy + 0.75, H.z0 + 0.6, x + 0.5, hy + 0.8, H.z1 - 0.3, WOOD);
      for (let z = H.z0 + 0.75; z < H.z1 - 0.4; z += 0.3) {
        g.fillBox(x + 0.15, hy + 0.8, z - 0.08, x + 0.33, hy + 0.95, z + 0.08, grain('#b8603a', 0.3));
        g.fillBox(x + 0.2, hy + 0.95, z - 0.05, x + 0.28, hy + 1.05 + ((z * 7) % 1) * 0.1, z + 0.05, grain('#6aa04a', 0.6));
      }
    }
  }));
  // The glass: one mesh, faintly green, see-through.
  const glassGrid = new VoxelGrid([H.x0, hy + 0.3, H.z0], [H.x1, ridge, H.z1], 0.05);
  glassGrid.fill([H.x0, hy + 0.3, H.z0], [H.x1, ridge, H.z1], (px, py, pz) => {
    const wall = px < H.x0 + 0.05 || px > H.x1 - 0.05 || pz < H.z0 + 0.05 || pz > H.z1 - 0.05;
    const door = pz < H.z0 + 0.05 && Math.abs(px - midx) < 0.5 && py < hy + 2.0;
    const roof = Math.abs(py - roofY(px)) < 0.03;
    return (wall && py < roofY(px) && !door) || roof;
  }, color('#ffffff'));
  const glass = voxelMesh(glassGrid);
  glass.material = new MeshBasicMaterial({ color: 0xcfe8e0, transparent: true, opacity: 0.22, depthWrite: false, side: DoubleSide });
  glass.castShadow = false;
  col.addSeg(H.x0, H.z0, midx - 0.5, H.z0);
  col.addSeg(midx + 0.5, H.z0, H.x1, H.z0);
  col.addSeg(H.x1, H.z0, H.x1, H.z1);
  col.addSeg(H.x1, H.z1, H.x0, H.z1);
  col.addSeg(H.x0, H.z1, H.x0, H.z0);
  for (const x of [H.x0 + 0.15, H.x1 - 0.65]) col.addBox(x, H.z0 + 0.6, x + 0.5, H.z1 - 0.3, hy, hy + 1.1);

  // ── The well: a stone ring, a little roof on two posts, a bucket on a rope ──
  const W = PLACES.well;
  const wy = blockHeight(W.x, W.z);
  add(cluster([W.x - 1, wy - 0.2, W.z - 1], [W.x + 1, wy + 2.6, W.z + 1], 0.05, (g) => {
    g.fill([W.x - 0.8, wy - 0.2, W.z - 0.8], [W.x + 0.8, wy + 0.75, W.z + 0.8], (px, py, pz) => { const d = Math.hypot(px - W.x, pz - W.z); return d < 0.75 && d > 0.5; }, (i, j, k) => (j % 4 === 0 ? color('#6a6a72') : STONE(i, j, k)));
    g.fill([W.x - 0.5, wy - 0.2, W.z - 0.5], [W.x + 0.5, wy + 0.3, W.z + 0.5], (px, py, pz) => Math.hypot(px - W.x, pz - W.z) < 0.5, color('#1a2230')); // dark water far down
    for (const ox of [-0.7, 0.65]) g.fillBox(W.x + ox, wy + 0.6, W.z - 0.05, W.x + ox + 0.1, wy + 1.9, W.z + 0.05, DARK);
    g.fillBox(W.x - 0.7, wy + 1.55, W.z - 0.025, W.x + 0.75, wy + 1.6, W.z + 0.025, DARK); // the crank's axle
    g.fillBox(W.x - 0.02, wy + 0.95, W.z - 0.02, W.x + 0.02, wy + 1.55, W.z + 0.02, color('#c8b080')); // rope
    g.fillBox(W.x - 0.12, wy + 0.75, W.z - 0.12, W.x + 0.12, wy + 0.95, W.z + 0.12, grain('#7a5a3a', 0.4)); // bucket
    g.fill([W.x - 1, wy + 1.8, W.z - 0.9], [W.x + 1, wy + 2.5, W.z + 0.9], (px, py, pz) => Math.abs(py - (wy + 2.45 - Math.abs(pz - W.z) * 0.7)) < 0.05 && Math.abs(px - W.x) < 0.95, grain('#7a4a3a', 0.4)); // roof
  }));
  col.addCircle(W.x, W.z, 0.8);

  // ── The woodpile and chopping block, with the axe in it ──
  const P = PLACES.woodpile;
  const py0 = blockHeight(P.x, P.z);
  add(cluster([P.x - 1, py0, P.z - 1.6], [P.x + 1.6, py0 + 1.4, P.z + 1.6], 0.05, (g) => {
    for (let row = 0; row < 5; row++) {
      for (let k = 0; k < 9 - row; k++) {
        const ly = py0 + 0.12 + row * 0.22;
        const lz = P.z - 1.4 + row * 0.11 + k * 0.24;
        g.fill([P.x - 0.6, ly - 0.12, lz - 0.12], [P.x + 0.6, ly + 0.12, lz + 0.12], (px, py, pz) => Math.hypot(py - ly, pz - lz) < 0.11, (i, j, kk) => (i <= 8 || i >= 31 ? color('#c8a878') : grain('#6a4a30', 0.6)(i, j, kk)));
      }
    }
    // A roof board over it, on two posts.
    for (const z of [P.z - 1.5, P.z + 1.4]) g.fillBox(P.x + 0.5, py0, z, P.x + 0.6, py0 + 1.35, z + 0.1, DARK);
    g.fillBox(P.x - 0.7, py0 + 1.3, P.z - 1.55, P.x + 0.7, py0 + 1.36, P.z + 1.55, grain('#7a4a3a', 0.4));
    // The chopping block and the axe.
    const bx = P.x + 1.1;
    g.fill([bx - 0.3, py0, P.z - 0.3], [bx + 0.3, py0 + 0.5, P.z + 0.3], (px, py, pz) => Math.hypot(px - bx, pz - P.z) < 0.26, (i, j) => (j >= 9 ? color('#c8a878') : grain('#6a4a30', 0.5)(i, j, 0)));
    g.fillBox(bx - 0.02, py0 + 0.5, P.z - 0.025, bx + 0.02, py0 + 1.05, P.z + 0.025, color('#a0804a')); // handle
    g.fillBox(bx - 0.1, py0 + 0.48, P.z - 0.03, bx + 0.12, py0 + 0.6, P.z + 0.03, color('#6a6a72')); // head, buried in the block
  }));
  col.addBox(P.x - 0.6, P.z - 1.55, P.x + 0.6, P.z + 1.55, py0, py0 + 1.4);
  col.addCircle(P.x + 1.1, P.z, 0.3);

  // ── A handcart with sacks ──
  const C = PLACES.cart;
  const cy = blockHeight(C.x, C.z);
  add(cluster([C.x - 1.3, cy, C.z - 0.9], [C.x + 1.8, cy + 1.3, C.z + 0.9], 0.05, (g) => {
    g.fillBox(C.x - 0.9, cy + 0.5, C.z - 0.6, C.x + 0.9, cy + 0.58, C.z + 0.6, WOOD); // bed
    for (const z of [C.z - 0.6, C.z + 0.55]) g.fillBox(C.x - 0.9, cy + 0.58, z, C.x + 0.9, cy + 0.9, z + 0.05, WOOD); // sides
    g.fillBox(C.x - 0.9, cy + 0.58, C.z - 0.6, C.x - 0.85, cy + 0.9, C.z + 0.6, WOOD);
    for (const z of [C.z - 0.75, C.z + 0.7]) {
      g.fill([C.x - 0.45, cy, z], [C.x + 0.45, cy + 0.9, z + 0.05], (px, py) => { const d = Math.hypot(px - C.x, py - cy - 0.42); return (d < 0.42 && d > 0.36) || (d < 0.42 && (Math.abs(px - C.x) < 0.025 || Math.abs(py - cy - 0.42) < 0.025)); }, DARK); // wheels with spokes
    }
    for (const z of [C.z - 0.6, C.z + 0.55]) g.fillBox(C.x + 0.9, cy + 0.52, z, C.x + 1.7, cy + 0.57, z + 0.05, DARK); // handles
    for (const [ox, oz] of [[-0.4, -0.2], [0.2, 0.15], [-0.1, 0.25]]) g.fill([C.x + ox - 0.3, cy + 0.58, C.z + oz - 0.25], [C.x + ox + 0.3, cy + 1.2, C.z + oz + 0.25], (px, py, pz) => Math.hypot((px - C.x - ox) / 0.25, (py - cy - 0.85) / 0.3, (pz - C.z - oz) / 0.2) < 1, grain('#c8b080', 0.4)); // sacks
  }));
  col.addBox(C.x - 0.9, C.z - 0.8, C.x + 1.7, C.z + 0.8, cy, cy + 1.2);

  // ── Washing on a line ──
  const L = PLACES.washing;
  const ly = blockHeight((L.x0 + L.x1) / 2, L.z);
  add(cluster([L.x0 - 0.2, ly, L.z - 0.4], [L.x1 + 0.2, ly + 2.1, L.z + 0.4], 0.05, (g) => {
    for (const x of [L.x0, L.x1 - 0.1]) {
      g.fillBox(x, ly, L.z - 0.05, x + 0.1, ly + 1.9, L.z + 0.05, DARK);
      g.fillBox(x - 0.05, ly + 1.8, L.z - 0.35, x + 0.15, ly + 1.85, L.z + 0.35, DARK); // the T
    }
    g.fillBox(L.x0, ly + 1.82, L.z - 0.325, L.x1, ly + 1.84, L.z - 0.3, color('#e8e0c8')); // the line
    const cloths = [[0.4, 1.1, '#f4f0e8', 0.7], [1.7, 0.6, '#6a86b8', 0.5], [2.5, 0.9, '#e8a0a0', 0.65], [3.6, 1.5, '#f4f0e8', 0.85], [5.3, 0.5, '#e8c050', 0.45], [6.1, 0.7, '#7aa06a', 0.6]];
    for (const [ox, w, hex, h] of cloths) g.fillBox(L.x0 + ox, ly + 1.82 - h, L.z - 0.33, L.x0 + ox + w, ly + 1.82, L.z - 0.3, grain(hex, 0.2));
  }));
  for (const x of [L.x0 + 0.05, L.x1 - 0.05]) col.addCircle(x, L.z, 0.15);

  const mesh = bake(parts);
  return { group: [mesh, glass] };
}
