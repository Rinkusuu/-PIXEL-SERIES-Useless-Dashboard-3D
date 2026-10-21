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
import { birch, bush, deadTree, fallenLog, pine, roundTree, tallPine } from './models.js';
import { rng } from '../core/util.js';

const MAX_TREES = 2200;

/** Every tree's place, species and size, decided once from a seed. */
/* Species, and their share of the forest. Deep forest (high density) leans to
   tall pines; the thin edges and the odd meadow tree to birches and bushes. */
const KINDS = ['pine', 'round', 'birch', 'tallPine', 'dead', 'bush', 'log'];
function pickKind(u, density) {
  const deep = density > 0.7;
  const table = deep
    ? [['tallPine', 0.32], ['pine', 0.3], ['round', 0.1], ['birch', 0.06], ['dead', 0.06], ['bush', 0.08], ['log', 0.08]]
    : [['pine', 0.25], ['round', 0.25], ['birch', 0.22], ['bush', 0.18], ['dead', 0.04], ['log', 0.03], ['tallPine', 0.03]];
  for (const [k, w] of table) {
    if (u < w) return k;
    u -= w;
  }
  return 'pine';
}

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
    random.push({ x, z, kind: pickKind(r(), forestDensity(x, z)), s: 0.75 + r() * 0.7, rot: r() * 6.28 });
  }
  // Fisher–Yates with the same generator: a lower tier thins evenly.
  for (let i = random.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [random[i], random[j]] = [random[j], random[i]];
  }
  return trees.concat(random);
}

const TILE = 48;
const NEAR = 45; // metres: closer than this, the full 25 cm voxel tree; further, the 50 cm one

export class Forest {
  constructor(col) {
    this.trees = plantForest();
    const mat = new MeshLambertMaterial({ vertexColors: true });
    const geo = {
      near: { pine: mesh(pine(1, 0.25)), round: mesh(roundTree(2, 0.25)), birch: mesh(birch(4, 0.25)), tallPine: mesh(tallPine(5, 0.25)), dead: mesh(deadTree(6, 0.25)), bush: mesh(bush(7, 0.2)), log: mesh(fallenLog(8, 0.1)) },
      far: { pine: mesh(pine(1, 0.5)), round: mesh(roundTree(2, 0.5)), birch: mesh(birch(4, 0.5)), tallPine: mesh(tallPine(5, 0.5)), dead: mesh(deadTree(6, 0.5)), bush: mesh(bush(7, 0.4)), log: mesh(fallenLog(8, 0.2)) },
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
        for (const kind of KINDS) {
          const n = list.filter((i) => this.trees[i].kind === kind).length;
          const m = new InstancedMesh(geo[lod][kind], mat, Math.max(1, n));
          m.castShadow = m.receiveShadow = true;
          m.count = 0;
          tile[lod][kind] = m;
        }
      }
      const count = Object.fromEntries(KINDS.map((k) => [k, 0]));
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
        if (t.kind === 'log') {
          // A log lies along its local x, turned in quarter turns: block its whole length, low down.
          const q = Math.round(t.rot / (Math.PI / 2)) % 2;
          const hx = q ? 0 : 1.5 * t.s;
          const hz = q ? 1.5 * t.s : 0;
          t.collider = col.addSeg(t.x - hx, t.z - hz, t.x + hx, t.z + hz, -Infinity, blockHeight(t.x, t.z) + 0.7 * t.s);
        } else if (t.kind === 'bush') t.collider = col.addCircle(t.x, t.z, 0.6 * t.s);
        else t.collider = col.addCircle(t.x, t.z, 0.28 * t.s + 0.05);
      }
      for (const lod of ['near', 'far']) {
        for (const kind of KINDS) {
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
    for (const t of this.tiles) for (const lod of ['near', 'far']) for (const k of KINDS) if (t[lod][k].count) scene.add(t[lod][k]);
  }

  /** Keep the first `fraction` of the shuffled forest; switch the rest's trunks off too. */
  setDensity(fraction) {
    const keep = Math.max(2, Math.round(this.trees.length * fraction));
    this.trees.forEach((t, i) => (t.collider.on = i < keep));
    for (const tile of this.tiles) {
      const shown = Object.fromEntries(KINDS.map((k) => [k, 0]));
      for (const i of tile.list) if (i < keep) shown[this.trees[i].kind]++;
      for (const lod of ['near', 'far']) for (const kind of KINDS) tile[lod][kind].count = shown[kind];
    }
  }

  /** Detail by distance, and nothing at all past the fog. */
  update(camPos, far) {
    for (const t of this.tiles) {
      const d = Math.hypot(t.cx - camPos.x, t.cz - camPos.z) - TILE * 0.7;
      const near = d < NEAR;
      const seen = d < far;
      for (const k of KINDS) {
        t.near[k].visible = seen && near;
        t.far[k].visible = seen && !near;
      }
    }
  }
}
