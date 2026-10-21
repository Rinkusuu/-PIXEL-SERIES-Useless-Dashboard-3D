/* ============================================================================
   groundcover.js — everything small that grows or lies on the ground.

   Pebbles in the grass, mushrooms on the forest floor, wildflowers in
   clumps (they grow in patches, not evenly: a noise field decides where),
   taller grass where the meadow meets the trees and the water, reeds and
   cattails along the shore, lily pads on the lake, stones at the water's
   edge. Each kind is one small voxel model, scattered by a seed (the same
   ground every visit), bucketed into 48 m tiles and instanced, and hidden
   past ~70 m like the grass.
   ========================================================================== */

import { Color, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import { MAP_HALF, WALK_RADIUS, WATER_Y, blockHeight, forestDensity, grassDensity, isWater, lakeE, pathDist } from './layout.js';
import { VoxelGrid, color, grain, mesh } from './voxel.js';
import { rock, tuftGeometry } from './models.js';
import { fbm2, rng } from '../core/util.js';

const TILE = 48;
const REACH = 75;

/* ── The little models ─────────────────────────────────────────────────── */

function pebbles() {
  const g = new VoxelGrid([-0.2, 0, -0.2], [0.2, 0.1, 0.2], 0.04);
  for (const [x, z, r] of [[-0.08, 0.02, 0.07], [0.07, -0.05, 0.05], [0.05, 0.09, 0.04]]) {
    g.fill([x - r, 0, z - r], [x + r, r, z + r], (px, py, pz) => Math.hypot((px - x) / r, (py) / (r * 0.6), (pz - z) / r) < 1, grain('#9a9aa2', 0.7));
  }
  return mesh(g);
}

function mushrooms(cap) {
  const g = new VoxelGrid([-0.2, 0, -0.2], [0.2, 0.25, 0.2], 0.025);
  for (const [x, z, h, r] of [[0, 0, 0.16, 0.07], [0.1, 0.06, 0.1, 0.05], [-0.08, 0.07, 0.07, 0.04]]) {
    g.fillBox(x - 0.0125, 0, z - 0.0125, x + 0.0125, h, z + 0.0125, color('#ece4d0'));
    g.fill([x - r, h, z - r], [x + r, h + r, z + r], (px, py, pz) => Math.hypot(px - x, (py - h) * 1.6, pz - z) < r, cap === 'red' ? (i, j, k) => ((i + k) % 3 === 0 ? color('#f4f0e8') : color('#c8402e')) : grain('#9a6a3a', 0.6));
  }
  return mesh(g);
}

function flowers(hexes, seed) {
  const g = new VoxelGrid([-0.35, 0, -0.35], [0.35, 0.55, 0.35], 0.03);
  const r = rng(seed);
  for (let i = 0; i < 7; i++) {
    const x = (r() - 0.5) * 0.55;
    const z = (r() - 0.5) * 0.55;
    const h = 0.25 + r() * 0.25;
    g.fillBox(x, 0, z, x + 0.03, h, z + 0.03, color('#4f8a3e'));
    const c = color(hexes[i % hexes.length]);
    g.fillBox(x - 0.03, h, z - 0.03, x + 0.06, h + 0.03, z + 0.06, c);
    g.fillBox(x, h + 0.03, z, x + 0.03, h + 0.06, z + 0.03, color('#f0d070'));
  }
  return mesh(g);
}

function tallGrass() {
  const geo = tuftGeometry().clone();
  geo.scale(1.3, 2.2, 1.3);
  return geo;
}

function reeds() {
  const g = new VoxelGrid([-0.3, 0, -0.3], [0.3, 1.8, 0.3], 0.03);
  const r = rng(61);
  for (let i = 0; i < 7; i++) {
    const x = (r() - 0.5) * 0.45;
    const z = (r() - 0.5) * 0.45;
    const h = 0.9 + r() * 0.7;
    g.fillBox(x, 0, z, x + 0.03, h, z + 0.03, color(i % 2 ? '#5a8a3a' : '#6a9a48'));
    if (i % 3 === 0) g.fillBox(x, h - 0.22, z, x + 0.03, h - 0.04, z + 0.03, color('#6a4a30')); // the cattail: a slim brown head, no wider than its stalk
  }
  return mesh(g);
}

function lilyPad(flower) {
  const g = new VoxelGrid([-0.4, 0, -0.4], [0.4, 0.12, 0.4], 0.04);
  g.fill([-0.4, 0, -0.4], [0.4, 0.04, 0.4], (x, y, z) => Math.hypot(x, z) < 0.36 && !(x > 0 && Math.abs(z) < x * 0.3), grain('#4a8a3a', 0.5));
  if (flower) g.fill([-0.1, 0.04, -0.1], [0.1, 0.12, 0.1], (x, y, z) => Math.hypot(x, z) < 0.08, (i, j) => (j > 1 ? color('#f4d0e0') : color('#e890b0')));
  return mesh(g);
}

/* ── Where each kind may grow ────────────────────────────────────────────── */

const inWorld = (x, z) => Math.hypot(x, z) < WALK_RADIUS + 6;
const dry = (x, z) => !isWater(x, z);
const patch = (x, z, seed) => fbm2(x * 0.06, z * 0.06, 2, seed); // clumping

const KINDS = [
  { name: 'pebbles', geo: () => pebbles(), n: 2600, ok: (x, z) => dry(x, z) && lakeE(x, z) > 1.05 && (pathDist(x, z) < 2.4 || patch(x, z, 19) > 0.62) },
  { name: 'mushroomRed', geo: () => mushrooms('red'), n: 500, ok: (x, z) => dry(x, z) && forestDensity(x, z) > 0.45 && patch(x, z, 3) > 0.55 },
  { name: 'mushroomBrown', geo: () => mushrooms('brown'), n: 900, ok: (x, z) => dry(x, z) && forestDensity(x, z) > 0.35 && patch(x, z, 4) > 0.5 },
  { name: 'flowersWarm', geo: () => flowers(['#f0d070', '#f4f1ff', '#ffb050'], 1), n: 1600, ok: (x, z) => grassDensity(x, z) > 0.3 && patch(x, z, 7) > 0.58 },
  { name: 'flowersCool', geo: () => flowers(['#c8a0d8', '#8fb0f0', '#f4f1ff'], 2), n: 1400, ok: (x, z) => grassDensity(x, z) > 0.3 && patch(x, z, 9) > 0.6 },
  { name: 'flowersRed', geo: () => flowers(['#e05a6a', '#ff8fa3', '#f0d070'], 3), n: 900, ok: (x, z) => grassDensity(x, z) > 0.3 && patch(x, z, 11) > 0.63 },
  {
    name: 'tallGrass', geo: () => tallGrass(), n: 5000, wind: true,
    // Where the mown meadow gives way: the forest's edge and the shore's.
    ok: (x, z) => dry(x, z) && ((forestDensity(x, z) > 0.12 && forestDensity(x, z) < 0.6) || (lakeE(x, z) > 1.04 && lakeE(x, z) < 1.2)) && pathDist(x, z) > 1.4,
  },
  { name: 'reeds', geo: () => reeds(), n: 650, wind: true, ok: (x, z) => lakeE(x, z) > 0.94 && lakeE(x, z) < 1.05 && patch(x, z, 13) > 0.55 },
  { name: 'lily', geo: () => lilyPad(false), n: 320, water: true, ok: (x, z) => lakeE(x, z) > 0.55 && lakeE(x, z) < 0.92 && patch(x, z, 17) > 0.55 },
  { name: 'lilyFlower', geo: () => lilyPad(true), n: 70, water: true, ok: (x, z) => lakeE(x, z) > 0.55 && lakeE(x, z) < 0.92 && patch(x, z, 17) > 0.6 },
  { name: 'shoreStones', geo: () => mesh(rock(0.3, 21, 0.06)), n: 500, ok: (x, z) => lakeE(x, z) > 0.98 && lakeE(x, z) < 1.1 },
];

export class Groundcover {
  /** @param {(m: Material) => Material} windy  the meadow's wind patch, for things that sway */
  constructor(windy) {
    this.material = new MeshLambertMaterial({ vertexColors: true });
    this.windMaterial = windy(new MeshLambertMaterial({ vertexColors: true }));
    const r = rng(777);
    const o = new Object3D();
    const tint = new Color();
    const tiles = new Map();
    const at = (x, z) => {
      const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
      if (!tiles.has(key)) tiles.set(key, { cx: (Math.floor(x / TILE) + 0.5) * TILE, cz: (Math.floor(z / TILE) + 0.5) * TILE, meshes: [] });
      return tiles.get(key);
    };

    // Scatter each kind with rejection sampling, bucket by tile.
    for (const kind of KINDS) {
      const geo = kind.geo();
      const byTile = new Map();
      let placed = 0;
      for (let tries = 0; placed < kind.n && tries < kind.n * 30; tries++) {
        const x = (r() * 2 - 1) * MAP_HALF;
        const z = (r() * 2 - 1) * MAP_HALF;
        if (!inWorld(x, z) || !kind.ok(x, z)) continue;
        const t = at(x, z);
        if (!byTile.has(t)) byTile.set(t, []);
        byTile.get(t).push([x, z, r(), r()]);
        placed++;
      }
      for (const [t, list] of byTile) {
        const m = new InstancedMesh(geo, kind.wind ? this.windMaterial : this.material, list.length);
        list.forEach(([x, z, a, b], i) => {
          const y = kind.water ? WATER_Y + 0.01 : blockHeight(x, z);
          o.position.set(x, y, z);
          o.rotation.set(0, Math.round(a * 4) * (Math.PI / 2), 0); // quarter turns: the voxel world's grid
          o.scale.setScalar(0.8 + b * 0.5);
          o.updateMatrix();
          m.setMatrixAt(i, o.matrix);
          m.setColorAt(i, tint.setHSL(0, 0, 0.88 + b * 0.24));
        });
        m.castShadow = !kind.water && kind.name !== 'tallGrass';
        m.receiveShadow = true;
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
        t.meshes.push(m);
      }
    }
    this.tiles = [...tiles.values()];
  }

  addTo(scene) {
    for (const t of this.tiles) scene.add(...t.meshes);
  }

  /** Sparser on lower tiers: the same prefix of every tile, so it thins evenly. */
  setDensity(fraction) {
    for (const t of this.tiles) for (const m of t.meshes) m.count = Math.max(0, Math.round(m.instanceMatrix.count * fraction));
  }

  update(camPos) {
    const reach = (REACH + TILE * 0.71) ** 2;
    for (const t of this.tiles) {
      const on = (t.cx - camPos.x) ** 2 + (t.cz - camPos.z) ** 2 < reach;
      for (const m of t.meshes) m.visible = on;
    }
  }
}
