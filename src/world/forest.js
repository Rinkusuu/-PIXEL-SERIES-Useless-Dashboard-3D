/* ============================================================================
   forest.js — trees, instanced: two species, hundreds of each, a few draws.

   Positions come from layout.forestDensity by seeded rejection sampling, so
   the forest is the same forest every visit. The list is shuffled before it
   is used, which means a lower tier keeps a thinner forest that is still the
   same SHAPE — it drops trees evenly, not the whole east side.

   Two trees are not random: the big tree the leaves fall from, and the one
   on the island. They are always first, so no tier removes them.
   ========================================================================== */

import {
  BufferAttribute, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, InstancedMesh,
  MeshLambertMaterial, Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLAND, MAP_HALF, SPOTS, forestDensity, heightAt } from './layout.js';
import { rng } from '../core/util.js';

const MAX_TREES = 2200;

/** Flat-shaded, vertex-coloured part. */
function part(geo, hex, dy) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.translate(0, dy, 0);
  g.computeVertexNormals();
  const c = new Color(hex);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) c.toArray(col, i);
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

function pineGeometry() {
  return mergeGeometries([
    part(new CylinderGeometry(0.16, 0.22, 1.8, 5), '#7a5a40', 0.9),
    part(new ConeGeometry(1.7, 2.6, 7), '#3f7a52', 2.6),
    part(new ConeGeometry(1.3, 2.2, 7), '#468658', 3.9),
    part(new ConeGeometry(0.85, 1.9, 7), '#4f9160', 5.0),
  ]);
}

function roundGeometry() {
  return mergeGeometries([
    part(new CylinderGeometry(0.18, 0.26, 2.6, 5), '#7a5a40', 1.3),
    part(new IcosahedronGeometry(1.9, 0), '#5a9a4e', 3.6),
    part(new IcosahedronGeometry(1.2, 0), '#6aaa58', 4.7),
  ]);
}

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

export class Forest {
  constructor(col) {
    this.trees = plantForest();
    const mat = new MeshLambertMaterial({ vertexColors: true });
    this.meshes = {
      pine: new InstancedMesh(pineGeometry(), mat, this.trees.length),
      round: new InstancedMesh(roundGeometry(), mat, this.trees.length),
    };
    const o = new Object3D();
    const tint = new Color();
    const count = { pine: 0, round: 0 };
    const r = rng(17);
    this.slots = []; // tree index → [kind, instance index]
    for (const t of this.trees) {
      o.position.set(t.x, heightAt(t.x, t.z) - 0.15, t.z);
      o.rotation.set(0, t.rot, 0);
      o.scale.setScalar(t.s);
      o.updateMatrix();
      const m = this.meshes[t.kind];
      const i = count[t.kind]++;
      m.setMatrixAt(i, o.matrix);
      // A little variety of green per tree, so the forest isn't one colour.
      m.setColorAt(i, tint.setHSL(0, 0, 0.82 + r() * 0.3));
      this.slots.push([t.kind, i]);
      t.collider = col.addCircle(t.x, t.z, 0.28 * t.s + 0.05);
    }
    for (const [k, m] of Object.entries(this.meshes)) {
      m.count = count[k];
      m.castShadow = true;
      m.receiveShadow = true;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
    this.total = count;
  }

  addTo(scene) {
    scene.add(this.meshes.pine, this.meshes.round);
  }

  /** Keep the first `fraction` of the shuffled forest; switch the rest's trunks off too. */
  setDensity(fraction) {
    const keep = Math.max(2, Math.round(this.trees.length * fraction));
    const shown = { pine: 0, round: 0 };
    this.trees.forEach((t, i) => {
      const on = i < keep;
      t.collider.on = on;
      if (on) shown[t.kind] = Math.max(shown[t.kind], this.slots[i][1] + 1);
    });
    // Instances were written in tree order per species, so a prefix of trees
    // is a prefix of each species' instances.
    this.meshes.pine.count = shown.pine;
    this.meshes.round.count = shown.round;
  }
}
