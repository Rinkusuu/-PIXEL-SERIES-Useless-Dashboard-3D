/* ============================================================================
   forest.js — trees, instanced: two species, hundreds of each, a few draws.

   Positions come from layout.forestDensity by seeded rejection sampling, so
   the forest is the same forest every visit. The list is shuffled before it
   is used, which means a lower tier keeps a thinner forest that is still the
   same SHAPE — it drops trees evenly, not the whole east side.

   Two trees are not random: the big tree the leaves fall from, and the one
   on the island. They are always first, so no tier removes them.
   ========================================================================== */

import { Color, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import { ISLAND, MAP_HALF, SPOTS, blockHeight, forestDensity } from './layout.js';
import { mesh } from './voxel.js';
import { pine, roundTree } from './models.js';
import { rng } from '../core/util.js';

const MAX_TREES = 2200;

/** Every tree's place, species and size, decided once from a seed. */
export function plantForest() {
  const r = rng(4096);
  const trees = [
    { x: SPOTS.leafTree.x, z: SPOTS.leafTree.z, kind: 'round', s: 2.1, rot: 0.4 },
    { x: ISLAND.x, z: ISLAND.z, kind: 'pine', s: 1.2, rot: 1.1 },
  ];
  const random = [];
  let tries = 0;
  while (random.length < MAX_TREES - trees.length && tries++ < 60000) {
    const x = (r() * 2 - 1) * MAP_HALF;
    const z = (r() * 2 - 1) * MAP_HALF;
    if (r() > forestDensity(x, z) * 0.55) continue;
    // Keep trunks apart: nothing closer than 2.6 m to its neighbour.
    if (random.some((t) => Math.abs(t.x - x) < 2.6 && Math.abs(t.z - z) < 2.6)) continue;
    random.push({ x, z, kind: r() < 0.62 ? 'pine' : 'round', s: 0.75 + r() * 0.7, rot: r() * 6.28 });
  }
  // Fisher–Yates with the same generator: a lower tier thins evenly.
  for (let i = random.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [random[i], random[j]] = [random[j], random[i]];
  }
  return trees.concat(random);
}

const TILE = 32;
const NEAR = 45; // metres: closer than this, the full 25 cm voxel tree; further, the 50 cm one

export class Forest {
  constructor(col) {
    this.trees = plantForest();
    const mat = new MeshLambertMaterial({ vertexColors: true });
    const geo = {
      near: { pine: mesh(pine(1, 0.25)), round: mesh(roundTree(2, 0.25)) },
      far: { pine: mesh(pine(1, 0.5)), round: mesh(roundTree(2, 0.5)) },
    };

    // Bucket by tile, keeping the shuffled order inside each tile, so a
    // density prefix of the whole forest is a prefix of every tile.
    const buckets = new Map();
    this.trees.forEach((t, idx) => {
      const key = `${Math.floor(t.x / TILE)},${Math.floor(t.z / TILE)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(idx);
    });

    const o = new Object3D();
    const tint = new Color();
    const r = rng(17);
    this.tiles = [];
    for (const [key, list] of buckets) {
      const [tx, tz] = key.split(',').map(Number);
      const tile = { cx: (tx + 0.5) * TILE, cz: (tz + 0.5) * TILE, list, near: {}, far: {} };
      for (const lod of ['near', 'far']) {
        for (const kind of ['pine', 'round']) {
          const n = list.filter((i) => this.trees[i].kind === kind).length;
          const m = new InstancedMesh(geo[lod][kind], mat, Math.max(1, n));
          m.castShadow = m.receiveShadow = true;
          m.count = 0;
          tile[lod][kind] = m;
        }
      }
      const count = { pine: 0, round: 0 };
      for (const i of list) {
        const t = this.trees[i];
        o.position.set(t.x, blockHeight(t.x, t.z), t.z);
        // Quarter turns only: a voxel tree turned 37° stops lining up with the voxel world.
        o.rotation.set(0, Math.round(t.rot / (Math.PI / 2)) * (Math.PI / 2), 0);
        o.scale.setScalar(t.s);
        o.updateMatrix();
        tint.setHSL(0, 0, 0.82 + r() * 0.3); // a little variety of green per tree
        const k = count[t.kind]++;
        for (const lod of ['near', 'far']) {
          tile[lod][t.kind].setMatrixAt(k, o.matrix);
          tile[lod][t.kind].setColorAt(k, tint);
        }
        t.collider = col.addCircle(t.x, t.z, 0.28 * t.s + 0.05);
      }
      for (const lod of ['near', 'far']) {
        for (const kind of ['pine', 'round']) {
          const m = tile[lod][kind];
          m.count = count[kind];
          m.instanceMatrix.needsUpdate = true;
          m.computeBoundingSphere(); // per tile, so the camera and the shadow camera can cull it
        }
      }
      this.tiles.push(tile);
    }
    this.setDensity(1);
  }

  addTo(scene) {
    for (const t of this.tiles) scene.add(t.near.pine, t.near.round, t.far.pine, t.far.round);
  }

  /** Keep the first `fraction` of the shuffled forest; switch the rest's trunks off too. */
  setDensity(fraction) {
    const keep = Math.max(2, Math.round(this.trees.length * fraction));
    this.trees.forEach((t, i) => (t.collider.on = i < keep));
    for (const tile of this.tiles) {
      const shown = { pine: 0, round: 0 };
      for (const i of tile.list) if (i < keep) shown[this.trees[i].kind]++;
      for (const lod of ['near', 'far']) for (const kind of ['pine', 'round']) tile[lod][kind].count = shown[kind];
    }
  }

  /** Detail by distance, and nothing at all past the fog. */
  update(camPos, far) {
    for (const t of this.tiles) {
      const d = Math.hypot(t.cx - camPos.x, t.cz - camPos.z) - TILE * 0.7;
      const near = d < NEAR;
      const seen = d < far;
      t.near.pine.visible = t.near.round.visible = seen && near;
      t.far.pine.visible = t.far.round.visible = seen && !near;
    }
  }
}
