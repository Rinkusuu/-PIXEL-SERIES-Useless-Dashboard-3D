/* ============================================================================
   interior.js — the cabin, lived in.

   The rooms house.js builds are the shell; this fills them. Books lean on the
   shelf, plates stack on the counter, a coat hangs by the door with the boots
   under it, there's a basket of logs by the hearth and embers in it, candles on
   the table and the mantel, a plant on the lake windowsill, a patterned rug,
   beams overhead and real window frames. Small things, in 2.5 cm voxels, each
   cluster in its own little grid (a grid the size of the room at that
   resolution would be 24 million cells) and all of it baked into one mesh at
   the end. Dust drifts in the light by day; embers breathe in the hearth.
   ========================================================================== */

import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial, Object3D } from 'three';
import { CABIN, SPOTS } from './layout.js';
import { VoxelGrid, bake, color, grain, voxelMesh } from './voxel.js';
import { LAYER_GLOW } from './renderer.js';
import { rng } from '../core/util.js';

const V = 0.025;
const f = CABIN.floorY;
const { x0, x1, z0, z1, loftY } = CABIN;

const BOOKS = ['#8a3a3a', '#3a5a8a', '#4a7a4a', '#c8a040', '#6a4a7a', '#2a2a30', '#b86a3a', '#e0d8c0'];

/** A cluster: a small grid over a world box, filled by `build(g)`. */
function cluster(min, max, build) {
  const g = new VoxelGrid(min, max, V);
  build(g);
  return voxelMesh(g);
}

/** A row of books standing on a board along z, with gaps and the odd one leaning. */
function books(g, x, y, za, zb, seed) {
  const r = rng(seed);
  let z = za;
  while (z < zb - 0.05) {
    if (r() < 0.12) {
      z += 0.06 + r() * 0.1; // a gap
      continue;
    }
    const w = 0.05 + Math.floor(r() * 3) * V; // thickness
    const h = 0.17 + r() * 0.12;
    const d = 0.15 + r() * 0.05;
    const c = color(BOOKS[Math.floor(r() * BOOKS.length)]);
    if (r() < 0.1 && z + h < zb) {
      g.fillBox(x, y, z, x + d, y + w, z + h, c); // one lying down
      z += h + V;
    } else {
      g.fillBox(x, y, z, x + d, y + h, z + w, c);
      g.fillBox(x + d - V, y + h * 0.75, z, x + d, y + h * 0.75 + V, z + w, color('#e8d8a0')); // a gilt band on the spine
      z += w;
    }
  }
}

export function buildInterior(col) {
  const parts = [];
  const add = (m) => parts.push(m);

  // ── The shelf: books on the low and high boards, jars beside the coin jar ──
  add(cluster([x0, f, 79.35], [x0 + 0.6, f + 2.1, 81.65], (g) => {
    books(g, x0 + 0.2, f + 0.55, 79.5, 81.5, 11);
    books(g, x0 + 0.2, f + 1.75, 79.5, 81.0, 23);
    books(g, x0 + 0.2, f + 1.15, 80.3, 81.5, 37);
    for (const [z, hex] of [[81.25, '#d0703c'], [80.95, '#7a9a4a']]) {
      // Two jars of something on the top board, past the books.
      g.fill([x0 + 0.2, f + 1.75, z - 0.08], [x0 + 0.45, f + 1.95, z + 0.08], (px, py, pz) => Math.hypot(px - (x0 + 0.32), pz - z) < 0.07, color('#c8e0e8'));
      g.fill([x0 + 0.2, f + 1.77, z - 0.08], [x0 + 0.45, f + 1.87, z + 0.08], (px, py, pz) => Math.hypot(px - (x0 + 0.32), pz - z) < 0.055, grain(hex, 0.6));
    }
  }));

  // ── The kitchen: plates, a loaf on a board, a bowl of apples, pans on hooks, a wall shelf ──
  const top = f + 0.96;
  const back = z1 - 0.1;
  add(cluster([6, top, z1 - 0.7], [10.45, f + 2.6, z1], (g) => {
    for (let i = 0; i < 5; i++) g.fill([8.0, top + i * V, z1 - 0.55], [8.4, top + (i + 1) * V, z1 - 0.15], (px, py, pz) => Math.hypot(px - 8.2, pz - (z1 - 0.35)) < 0.17, color(i % 2 ? '#e8e4dc' : '#d8d2c8'));
    g.fillBox(8.75, top, z1 - 0.55, 9.35, top + 0.025, z1 - 0.2, grain('#a0764e', 0.4)); // board
    g.fill([8.8, top + 0.025, z1 - 0.5], [9.3, top + 0.16, z1 - 0.25], (px, py, pz) => Math.hypot((px - 9.05) / 0.22, (py - top - 0.025) / 0.12, (pz - (z1 - 0.375)) / 0.1) < 1, grain('#c08a40', 0.6)); // the loaf
    g.fill([9.6, top, z1 - 0.55], [10.1, top + 0.15, z1 - 0.15], (px, py, pz) => {
      const r = Math.hypot(px - 9.85, pz - (z1 - 0.35));
      return r < 0.2 && py < top + 0.04 + r * 0.5 && (r > 0.17 || py < top + 0.03);
    }, grain('#7a5030', 0.3)); // bowl
    for (const [ax, az, hex] of [[9.8, z1 - 0.38, '#c03a2a'], [9.9, z1 - 0.3, '#d04a30'], [9.85, z1 - 0.42, '#8ab040']]) {
      g.fill([ax - 0.05, top + 0.04, az - 0.05], [ax + 0.05, top + 0.14, az + 0.05], (px, py, pz) => Math.hypot(px - ax, py - top - 0.09, pz - az) < 0.05, color(hex));
    }
    // Pans on hooks, and a rail.
    g.fillBox(6.1, f + 1.75, back - 0.025, 7.4, f + 1.78, back, color('#3a3a44'));
    for (const [px, r] of [[6.35, 0.13], [6.85, 0.1], [7.2, 0.08]]) {
      g.fill([px - r, f + 1.2, back - 0.05], [px + r, f + 1.75, back], (qx, qy) => Math.hypot(qx - px, qy - (f + 1.55 - r)) < r || (Math.abs(qx - px) < 0.0125 && qy > f + 1.55 - r), color('#2a2a30'));
    }
    // A wall shelf east of the window, with jars and a stack of bowls.
    g.fillBox(9.0, f + 1.8, back - 0.25, 10.4, f + 1.85, back, grain('#5e4030', 0.3));
    for (const [jx, hex] of [[9.2, '#e8c050'], [9.45, '#c8a0d8'], [9.7, '#d0703c']]) {
      g.fill([jx - 0.07, f + 1.85, back - 0.2], [jx + 0.07, f + 2.05, back - 0.05], (px, py, pz) => Math.hypot(px - jx, pz - (back - 0.125)) < 0.065, color('#c8e0e8'));
      g.fill([jx - 0.07, f + 1.86, back - 0.2], [jx + 0.07, f + 1.96, back - 0.05], (px, py, pz) => Math.hypot(px - jx, pz - (back - 0.125)) < 0.05, grain(hex, 0.5));
    }
    for (let i = 0; i < 3; i++) g.fill([10.0, f + 1.85 + i * 0.05, back - 0.22], [10.35, f + 1.9 + i * 0.05, back - 0.03], (px, py, pz) => Math.hypot(px - 10.17, pz - (back - 0.125)) < 0.09 - i * 0.01, color('#e8e4dc'));
  }));

  // ── The table: a candle in a holder, a mug, an open book ──
  const tt = f + 0.78;
  add(cluster([4.2, tt, 76.0], [5.8, tt + 0.3, 77.2], (g) => {
    g.fill([4.92, tt, 76.82], [5.08, tt + 0.03, 76.98], (px, py, pz) => Math.hypot(px - 5.0, pz - 76.9) < 0.075, color('#b8a070'));
    g.fillBox(4.975, tt + 0.03, 76.875, 5.025, tt + 0.16, 76.925, color('#f0e8d0')); // the candle
    g.fill([4.35, tt, 76.88], [4.53, tt + 0.1, 77.06], (px, py, pz) => { const r = Math.hypot(px - 4.44, pz - 76.97); return r < 0.06 && (r > 0.04 || py < tt + 0.02); }, color('#3a6a8a')); // mug
    g.fillBox(4.4, tt, 76.1, 4.62, tt + 0.025, 76.25, color('#e8e0c8')); // open book, left page
    g.fillBox(4.62, tt, 76.1, 4.84, tt + 0.025, 76.25, color('#f0e8d0')); // right page
    g.fillBox(4.4, tt, 76.1, 4.84, tt + 0.0125, 76.25, color('#6a3a3a'));
  }));

  // ── The lamp over the table: an enamel shade round the bulb ──
  add(cluster([4.7, f + 2.05, 76.35], [5.3, f + 2.45, 76.85], (g) => {
    g.fill([4.7, f + 2.12, 76.35], [5.3, f + 2.4, 76.85], (px, py, pz) => {
      const r = Math.hypot(px - 5, pz - 76.6);
      const outer = 0.07 + (f + 2.4 - py) * 0.75; // a cone opening downwards
      return r < outer && r > outer - 0.035;
    }, color('#3a5a4a'));
    g.fillBox(4.975, f + 2.35, 76.575, 5.025, f + 2.45, 76.625, color('#2a2a30'));
  }));

  // ── The south wall under the loft: a chest of drawers, a broom, a picture, a basket ──
  add(cluster([0.2, f, z1 - 0.6], [4.2, f + 2.1, z1], (g) => {
    const dz = z1 - 0.5;
    g.fillBox(0.4, f, dz, 1.9, f + 1.0, z1 - 0.05, grain('#7a5030', 0.4));
    for (let i = 0; i < 3; i++) {
      const y = f + 0.12 + i * 0.3;
      g.fillBox(0.45, y, dz - 0.025, 1.85, y + 0.25, dz, grain('#8a6040', 0.4)); // drawer fronts
      for (const kx of [0.8, 1.5]) g.fillBox(kx - 0.025, y + 0.1, dz - 0.05, kx + 0.025, y + 0.15, dz - 0.025, color('#c8a040'));
    }
    g.fillBox(0.4, f + 1.0, dz - 0.025, 1.9, f + 1.05, z1 - 0.05, grain('#5e4030', 0.3)); // top
    for (const [px, hex] of [[0.7, '#e8e4dc'], [0.95, '#7aa0c0']]) {
      g.fill([px - 0.15, f + 1.05, z1 - 0.15], [px + 0.15, f + 1.38, z1 - 0.08], (qx, qy) => Math.hypot(qx - px, qy - (f + 1.2)) < 0.14, color(hex)); // plates leaning on the wall
    }
    g.fillBox(1.45, f + 1.05, z1 - 0.3, 1.75, f + 1.3, z1 - 0.1, grain('#c8a040', 0.3)); // a little box
    // The broom, leaning.
    g.fill([2.3, f, z1 - 0.4], [2.7, f + 1.5, z1], (px, py, pz) => {
      const t = (py - f) / 1.5;
      const cx = 2.45 + t * 0.12;
      const cz = z1 - 0.3 + t * 0.2;
      return py < f + 0.35 ? Math.abs(px - cx) < 0.12 - (py - f) * 0.15 && Math.abs(pz - cz) < 0.04 : Math.hypot(px - cx, pz - cz) < 0.02;
    }, (i, j) => (j * V < 0.35 ? color('#c8a050') : color('#7a5030')));
    // A picture: hills and a lake, in a frame.
    // (The wall's inner face is at z1 − 0.1: the picture hangs just in front of it.)
    g.fillBox(2.9, f + 1.2, z1 - 0.15, 3.9, f + 1.9, z1 - 0.1, color('#5e4030'));
    g.fillBox(2.95, f + 1.25, z1 - 0.175, 3.85, f + 1.85, z1 - 0.15, (i, j) => {
      const y = j * V - 1.25; // paint indices count from the grid's floor; the canvas starts 1.25 m up
      return y < 0.2 ? color('#4a7aa0') : y < 0.32 ? color('#5a8a4a') : y < 0.42 + Math.sin(i * 0.3) * 0.05 ? color('#7a8aa8') : color('#e8c8a0');
    });
    // A basket of wool on the floor.
    g.fill([3.4, f, z1 - 0.5], [3.9, f + 0.3, z1 - 0.05], (px, py, pz) => { const r = Math.hypot(px - 3.65, pz - (z1 - 0.28)); return r < 0.2 && (r > 0.17 || py < f + 0.03); }, grain('#a0804a', 0.6));
    for (const [bx, bz, hex] of [[3.6, z1 - 0.3, '#c03a4a'], [3.72, z1 - 0.22, '#4a7ac0'], [3.66, z1 - 0.36, '#e8c050']]) g.fill([bx - 0.08, f + 0.15, bz - 0.08], [bx + 0.08, f + 0.31, bz + 0.08], (px, py, pz) => Math.hypot(px - bx, py - f - 0.23, pz - bz) < 0.075, grain(hex, 0.4));
  }));
  col.addBox(0.4, z1 - 0.55, 1.9, z1, f, f + 1.4);
  col.addCircle(3.65, z1 - 0.28, 0.22, f, f + 0.4);

  // ── By the door: coat and hat on pegs, boots, a mat ──
  add(cluster([3.2, f, z0 + 0.1], [4.3, f + 2.0, z0 + 0.6], (g) => {
    g.fillBox(3.3, f + 1.65, z0 + 0.1, 4.25, f + 1.75, z0 + 0.15, grain('#5e4030', 0.3)); // peg rail
    for (const px of [3.5, 3.8, 4.1]) g.fillBox(px - 0.0125, f + 1.66, z0 + 0.15, px + 0.0125, f + 1.69, z0 + 0.22, color('#2a2a30'));
    // The coat: shoulders on a peg, falling to the knee.
    g.fill([3.3, f + 0.75, z0 + 0.15], [3.75, f + 1.68, z0 + 0.38], (px, py, pz) => {
      const w = 0.12 + (f + 1.68 - py) * 0.12;
      return Math.abs(px - 3.5) < w && pz < z0 + 0.15 + 0.05 + (f + 1.68 - py) * 0.12;
    }, grain('#5a3a2a', 0.5));
    // A hat on the next peg.
    g.fill([3.7, f + 1.55, z0 + 0.15], [3.95, f + 1.72, z0 + 0.4], (px, py, pz) => Math.hypot(px - 3.82, pz - (z0 + 0.27)) < (py < f + 1.58 ? 0.12 : 0.07), color('#3a3a44'));
    // Boots on the floor.
    for (const bx of [3.45, 3.65]) {
      g.fillBox(bx - 0.06, f, z0 + 0.2, bx + 0.06, f + 0.3, z0 + 0.32, grain('#3a2a20', 0.3));
      g.fillBox(bx - 0.06, f, z0 + 0.32, bx + 0.06, f + 0.08, z0 + 0.5, grain('#3a2a20', 0.3));
    }
  }));
  add(cluster([4.3, f, z0 + 0.1], [5.7, f + 0.03, z0 + 1.0], (g) => {
    g.fillBox(4.35, f, z0 + 0.15, 5.65, f + 0.025, z0 + 0.95, (i, j, k) => color(((i + k) >> 1) % 2 ? '#8a6a3a' : '#a0804a')); // a woven mat
  }));
  col.addBox(3.3, z0, 4.25, z0 + 0.45, f, f + 1.8);

  // ── The hearth: a log basket, the poker, a mantel with candles and a small frame ──
  add(cluster([x1 - 1.4, f, 75.1], [x1, f + 1.75, 78.3], (g) => {
    g.fill([x1 - 0.95, f, 75.25], [x1 - 0.35, f + 0.35, 75.95], (px, py, pz) => {
      const r = Math.hypot(px - (x1 - 0.65), pz - 75.6);
      return r < 0.3 && (r > 0.26 || py < f + 0.04);
    }, grain('#8a6a3a', 0.6));
    for (let i = 0; i < 4; i++) {
      const lz = 75.4 + (i % 2) * 0.2;
      const ly = f + 0.08 + Math.floor(i / 2) * 0.1;
      g.fill([x1 - 0.9, ly, lz - 0.06], [x1 - 0.4, ly + 0.12, lz + 0.06], (px, py, pz) => Math.hypot(py - ly - 0.06, pz - lz) < 0.05, grain('#6a4a30', 0.6));
    }
    g.fill([x1 - 1.2, f, 78.1], [x1 - 1.1, f + 0.9, 78.25], (px, py, pz) => Math.hypot(px - (x1 - 1.15 + (py - f) * 0.05), pz - 78.17) < 0.02, color('#2a2a30')); // poker
    g.fillBox(x1 - 1.25, f + 1.4, 76.0, x1 - 0.8, f + 1.48, 78.0, grain('#5e4030', 0.3)); // mantel
    for (const cz of [76.3, 77.7]) g.fillBox(x1 - 1.05, f + 1.48, cz - 0.025, x1 - 1.0, f + 1.66, cz + 0.025, color('#f0e8d0'));
    g.fillBox(x1 - 0.9, f + 1.48, 76.85, x1 - 0.85, f + 1.72, 77.15, color('#c8a040')); // a frame…
    g.fillBox(x1 - 0.925, f + 1.52, 76.9, x1 - 0.9, f + 1.68, 77.1, color('#7aa0c0')); // …of somewhere with water
  }));
  col.addCircle(x1 - 0.65, 75.6, 0.32, f, f + 0.4);

  // ── Plants: a pot in the north-west corner, a little one on the lake windowsill ──
  add(cluster([x0, f, z0], [x0 + 1, f + 1.1, z0 + 1], (g) => {
    const px = x0 + 0.45;
    const pz = z0 + 0.45;
    g.fill([px - 0.2, f, pz - 0.2], [px + 0.2, f + 0.3, pz + 0.2], (qx, qy, qz) => Math.hypot(qx - px, qz - pz) < 0.13 + (qy - f) * 0.15, grain('#b8603a', 0.4));
    const r = rng(7);
    for (let i = 0; i < 9; i++) {
      const a = r() * 6.28;
      const lean = 0.15 + r() * 0.25;
      const h = 0.4 + r() * 0.4;
      g.fill([px - 0.5, f + 0.3, pz - 0.5], [px + 0.5, f + 0.3 + h, pz + 0.5], (qx, qy, qz) => {
        const t = (qy - f - 0.3) / h;
        return Math.hypot(qx - (px + Math.cos(a) * lean * t), qz - (pz + Math.sin(a) * lean * t)) < 0.03 + Math.sin(t * 3.14) * 0.03;
      }, grain(i % 2 ? '#4a8a4a' : '#5aa05a', 0.5));
    }
  }));
  col.addCircle(x0 + 0.45, z0 + 0.45, 0.25);
  add(cluster([x0, f + 1, 77.4], [x0 + 0.4, f + 1.4, 77.8], (g) => {
    g.fillBox(x0 + 0.12, f + 1.0, 77.52, x0 + 0.27, f + 1.12, 77.67, grain('#b8603a', 0.4));
    g.fill([x0 + 0.08, f + 1.12, 77.48], [x0 + 0.32, f + 1.32, 77.72], (px, py, pz) => Math.hypot(px - (x0 + 0.2), py - (f + 1.18), pz - 77.6) < 0.1, grain('#6aa04a', 0.7)); // a round little succulent
  }));

  // ── Surfaces: a patterned rug, beams overhead, window frames and sills ──
  add(cluster([3.3, f, 75.3], [6.7, f + 0.04, 77.9], (g) => {
    const cx = 5;
    const cz = 76.6;
    g.fillBox(3.4, f, 75.4, 6.6, f + 0.025, 77.8, (i, j, k) => {
      const px = 3.4 + i * V - 3.4;
      const pz = 75.4 + k * V - 75.4;
      const edge = Math.min(px, pz, 3.2 - px, 2.4 - pz);
      if (edge < 0.08) return color('#5a2a2a'); // border
      if (edge < 0.14) return color('#d8b878');
      const dx = Math.abs(3.4 + px - cx);
      const dz = Math.abs(75.4 + pz - cz);
      const diamond = (dx / 1.2 + dz / 0.8) % 0.5;
      return diamond < 0.08 ? color('#d8b878') : (Math.floor((dx + dz) * 4) % 2 ? color('#a85a4a') : color('#94493c'));
    });
  }));
  for (const bz of [74.6, 76.6]) {
    add(cluster([x0, f + 2.8, bz - 0.15], [x1, f + 3.05, bz + 0.15], (g) => g.fillBox(x0, f + 2.82, bz - 0.12, x1, f + 3.02, bz + 0.12, grain('#5e4030', 0.4))));
  }
  // Frames and sills on the inside of every window (the openings house.js cut).
  const frame = grain('#5e4030', 0.3);
  const sill = grain('#7a5030', 0.3);
  const windowsX = [[1.2, 2.8, 1.0, 2.1, z0, 1], [7.4, 9.0, 1.0, 2.1, z0, 1], [7.2, 8.6, 1.2, 2.0, z1, -1]];
  for (const [a, b, lo, hi, z, s] of windowsX) {
    add(cluster([a - 0.15, f + lo - 0.1, Math.min(z, z + s * 0.25)], [b + 0.15, f + hi + 0.1, Math.max(z, z + s * 0.25)], (g) => {
      const zi = z + s * 0.1;
      const zo = z + s * 0.2;
      g.fillBox(a - 0.1, f + lo - 0.075, Math.min(zi, zo + s * 0.05), b + 0.1, f + lo, Math.max(zi, zo + s * 0.05), sill);
      g.fillBox(a - 0.1, f + hi, Math.min(zi, zo), b + 0.1, f + hi + 0.075, Math.max(zi, zo), frame);
      for (const ex of [a - 0.1, b]) g.fillBox(ex, f + lo, Math.min(zi, zo), ex + 0.1, f + hi, Math.max(zi, zo), frame);
    }));
  }
  add(cluster([x0, f + 0.9, 76.25], [x0 + 0.25, f + 2.3, 79.15], (g) => {
    g.fillBox(x0 + 0.1, f + 0.925, 76.3, x0 + 0.25, f + 1.0, 79.1, sill);
    g.fillBox(x0 + 0.1, f + 2.2, 76.3, x0 + 0.2, f + 2.275, 79.1, frame);
    for (const ez of [76.3, 79.0]) g.fillBox(x0 + 0.1, f + 1.0, ez, x0 + 0.2, f + 2.2, ez + 0.1, frame);
  }));

  // ── The loft: a nightstand with a little lantern, a trunk, a rag rug ──
  add(cluster([3.6, loftY, 81.4], [7.4, loftY + 0.7, 82.4], (g) => {
    g.fillBox(3.8, loftY, 81.65, 4.3, loftY + 0.5, 82.15, grain('#7a5030', 0.4));
    g.fillBox(3.95, loftY + 0.5, 81.8, 4.15, loftY + 0.75, 82.0, color('#3a3a44')); // lantern frame
    g.fillBox(3.825, loftY + 0.25, 81.625, 4.275, loftY + 0.275, 81.65, color('#c8a040')); // drawer pull line
    g.fillBox(6.0, loftY, 81.5, 7.2, loftY + 0.5, 82.2, grain('#6a4a30', 0.4)); // trunk
    for (const tx of [6.15, 7.05]) g.fillBox(tx - 0.025, loftY, 81.48, tx + 0.025, loftY + 0.52, 82.22, color('#3a3a44')); // straps
  }));
  col.addBox(3.8, 81.65, 4.3, 82.15, loftY, loftY + 0.8);
  col.addBox(6.0, 81.5, 7.2, 82.2, loftY, loftY + 0.55);
  add(cluster([SPOTS.bed.x - 1.4, loftY, 79.1], [SPOTS.bed.x + 1.0, loftY + 0.03, 80.3], (g) => {
    g.fillBox(SPOTS.bed.x - 1.3, loftY, 79.2, SPOTS.bed.x + 0.9, loftY + 0.025, 80.2, (i, j, k) => color(['#6a86b8', '#c8a0d8', '#e8d8a0', '#8ab08a'][(k >> 2) % 4])); // a striped rag rug
  }));

  const mesh = bake(parts);

  // ── Things that glow: candle flames, the loft lantern, embers in the hearth ──
  const flames = [[5.0, tt + 0.18, 76.9], [x1 - 1.025, f + 1.69, 76.3], [x1 - 1.025, f + 1.69, 77.7], [4.05, loftY + 0.62, 81.9]];
  const flameMesh = new InstancedMesh(new BoxGeometry(0.03, 0.05, 0.03), new MeshBasicMaterial({ color: 0xffffff }), flames.length);
  const embers = new InstancedMesh(new BoxGeometry(0.04, 0.025, 0.04), new MeshBasicMaterial({ color: 0xffffff }), 24);
  const r = rng(99);
  const emberPos = Array.from({ length: 24 }, () => [x1 - 1.0 + r() * 0.42, f + 0.06 + r() * 0.04, 76.65 + r() * 0.7, r() * 6.28]);
  for (const m of [flameMesh, embers]) {
    m.layers.enable(LAYER_GLOW);
    m.castShadow = false;
  }

  // ── Dust in the light: a few dozen motes drifting through the room by day ──
  const dust = new InstancedMesh(new BoxGeometry(0.007, 0.007, 0.007), new MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 0.35, depthWrite: false }), 30);
  dust.castShadow = false;
  const motes = Array.from({ length: 30 }, () => [x0 + 0.5 + r() * 11, f + 0.4 + r() * 2.4, z0 + 0.4 + r() * 4.5, r() * 6.28]);

  const o = new Object3D();
  const c = new Color();
  return {
    group: [mesh, flameMesh, embers, dust],
    update(env) {
      const t = env.t;
      const flick = env.motion ? 1 : 0.2;
      flames.forEach(([x, y, z], i) => {
        o.position.set(x, y + Math.sin(t * 13 + i) * 0.004 * flick, z);
        o.scale.set(1, 0.8 + Math.sin(t * 9 + i * 2) * 0.25 * flick, 1);
        o.updateMatrix();
        flameMesh.setMatrixAt(i, o.matrix);
        flameMesh.setColorAt(i, c.setRGB(3, 1.9, 0.7)); // HDR, so it blooms
      });
      flameMesh.instanceMatrix.needsUpdate = true;
      flameMesh.instanceColor.needsUpdate = true;
      emberPos.forEach(([x, y, z, p], i) => {
        o.position.set(x, y, z);
        o.scale.setScalar(1);
        o.updateMatrix();
        embers.setMatrixAt(i, o.matrix);
        const k = 0.6 + 0.4 * Math.sin(t * (0.8 + (i % 5) * 0.3) + p) * (env.motion ? 1 : 0.3); // breathing, never flashing
        embers.setColorAt(i, c.setRGB(2.4 * k, 0.6 * k, 0.15 * k));
      });
      embers.instanceMatrix.needsUpdate = true;
      embers.instanceColor.needsUpdate = true;
      // Dust only shows by day (it's the light that shows it), and only drifts with motion.
      dust.visible = env.pal.lum > 0.4;
      if (!dust.visible) return;
      motes.forEach((m, i) => {
        if (env.motion) {
          m[0] += Math.sin(t * 0.13 + m[3]) * 0.0015;
          m[1] += Math.sin(t * 0.11 + m[3] * 2) * 0.0012;
          m[2] += Math.cos(t * 0.09 + m[3]) * 0.0015;
        }
        o.position.set(m[0], m[1], m[2]);
        o.updateMatrix();
        dust.setMatrixAt(i, o.matrix);
      });
      dust.instanceMatrix.needsUpdate = true;
    },
  };
}

