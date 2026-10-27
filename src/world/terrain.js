/* ============================================================================
   terrain.js — the ground, as columns of earth.

   Every BLOCK × BLOCK column rises to layout.blockHeight, so the hill is a
   stack of terraces and the lakeshore steps down into the water: the voxel
   world's ground. Each column top is coloured by what the place is (meadow,
   worn path, sand, mud, forest floor); runs of equal height and colour along
   x merge into one quad, and walls appear only where neighbours differ.
   ========================================================================== */

import { BufferAttribute, BufferGeometry, Color, Mesh, MeshLambertMaterial, RingGeometry } from 'three';
import { BLOCK, MAP_HALF, STREAM, WALK_RADIUS, blockHeight, forestDensity, lakeE, lineDist, pathDist } from './layout.js';
import { fbm2 } from '../core/util.js';

const C = {
  grass: new Color('#5f9a4a'),
  grassLight: new Color('#86b85e'),
  forestFloor: new Color('#3f6a3a'),
  moss: new Color('#5a8a3a'),
  leafLitter: new Color('#6a5a3a'),
  path: new Color('#9a7a52'),
  sand: new Color('#cdbb8a'),
  mud: new Color('#6b5a48'),
};
const SIDE = 0.9; // walls catch less sky than tops: a cheap, constant occlusion

/** The colour of the ground at a point. */
function groundColor(x, z, y, out) {
  const e = lakeE(x, z);
  const r = Math.hypot(x, z);
  const n = fbm2(x * 0.08, z * 0.08, 2, 5);

  out.copy(C.grass).lerp(C.grassLight, n * 0.8);
  const fd = forestDensity(x, z);
  out.lerp(C.forestFloor, fd * 0.7);
  // Under the trees the floor is patchy: moss in the damp, leaf litter in the dry.
  if (fd > 0.3) {
    const m = fbm2(x * 0.15, z * 0.15, 2, 23);
    if (m > 0.6) out.lerp(C.moss, (m - 0.6) * 2.2);
    else if (m < 0.35) out.lerp(C.leafLitter, (0.35 - m) * 1.8 * fd);
  }
  if (r > WALK_RADIUS + 2) out.lerp(C.forestFloor, Math.min(1, (r - WALK_RADIUS - 2) / 8)); // under the boundary forest

  const p = pathDist(x, z);
  if (p < 1.6) out.lerp(C.path, 1 - Math.max(0, p - 0.9) / 0.7);

  const s = lineDist(x, z, STREAM).d;
  if (s < 2.6) out.lerp(C.mud, 1 - Math.max(0, s - 1.4) / 1.2);

  if (e < 1.12 && y < 1.2) out.lerp(C.sand, Math.min(1, (1.12 - e) / 0.06));
  if (y < -0.15) out.lerp(C.mud, Math.min(1, -y / 1.2));
  return out;
}

/** Quantise a colour so neighbouring columns share it and their tops can merge. */
const LEVELS = 20;
const q = (v) => Math.round(v * LEVELS) / LEVELS;

export function buildTerrain() {
  const n = Math.round((MAP_HALF * 2) / BLOCK);
  const H = new Float32Array(n * n);
  const K = new Uint32Array(n * n); // packed quantised colour, for merging
  const M = new Uint8Array(n * n); // snow mask ×4: 0 path, 2 under trees, 4 open ground
  const cols = new Map(); // packed → [r, g, b]
  const tmp = new Color();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -MAP_HALF + (i + 0.5) * BLOCK;
      const z = -MAP_HALF + (j + 0.5) * BLOCK;
      const h = blockHeight(x, z);
      H[j * n + i] = h;
      groundColor(x, z, h, tmp);
      const rgb = [q(tmp.r), q(tmp.g), q(tmp.b)];
      const key = (rgb[0] * LEVELS) | ((rgb[1] * LEVELS) << 8) | ((rgb[2] * LEVELS) << 16);
      cols.set(key, rgb);
      // Paths stay trodden clear; trees hold some snow off the forest floor.
      const mask = pathDist(x, z) < 1.0 ? 0 : forestDensity(x, z) > 0.45 ? 2 : 4;
      M[j * n + i] = mask;
      K[j * n + i] = key * 8 + mask; // runs merge only where the mask agrees too
    }
  }

  const pos = [];
  const nor = [];
  const col = [];
  const msk = [];
  const idx = [];
  // Four corners, counter-clockwise seen from the normal's side.
  const quad = (a, b, c2, d, normal, rgb, k = 1, m = 4) => {
    const base = pos.length / 3;
    for (const p of [a, b, c2, d]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(normal[0], normal[1], normal[2]);
      col.push(rgb[0] * k, rgb[1] * k, rgb[2] * k);
      msk.push(m / 4);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const X = (i) => -MAP_HALF + i * BLOCK;
  const Z = (j) => -MAP_HALF + j * BLOCK;
  const FLOOR = -4;

  for (let j = 0; j < n; j++) {
    // Tops, merged along x.
    for (let i = 0; i < n; ) {
      const h = H[j * n + i];
      const key = K[j * n + i];
      let w = 1;
      while (i + w < n && H[j * n + i + w] === h && K[j * n + i + w] === key) w++;
      quad([X(i), h, Z(j + 1)], [X(i + w), h, Z(j + 1)], [X(i + w), h, Z(j)], [X(i), h, Z(j)], [0, 1, 0], cols.get(key >> 3), 1, key & 7);
      i += w;
    }
    // Walls where neighbours differ, and down to the floor at the map's edge.
    for (let i = 0; i < n; i++) {
      const h = H[j * n + i];
      const rgb = cols.get(K[j * n + i] >> 3);
      const east = i + 1 < n ? H[j * n + i + 1] : FLOOR;
      const west = i > 0 ? H[j * n + i - 1] : FLOOR;
      const south = j + 1 < n ? H[(j + 1) * n + i] : FLOOR;
      const north = j > 0 ? H[(j - 1) * n + i] : FLOOR;
      const x0 = X(i), x1 = X(i + 1), z0 = Z(j), z1 = Z(j + 1);
      if (east < h) quad([x1, east, z1], [x1, east, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0], rgb, SIDE);
      if (west < h) quad([x0, west, z0], [x0, west, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0], rgb, SIDE);
      if (south < h) quad([x0, south, z1], [x1, south, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1], rgb, SIDE);
      if (north < h) quad([x1, north, z0], [x0, north, z0], [x0, h, z0], [x1, h, z0], [0, 0, -1], rgb, SIDE);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('aSnowMask', new BufferAttribute(new Float32Array(msk), 1));
  g.setIndex(new BufferAttribute(pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  g.computeBoundingSphere();

  const mesh = new Mesh(g, new MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  mesh.castShadow = true; // terraces shade the step below them
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * The land past the edge of the map: a flat ring at the rim's height that the
 * fog swallows long before the camera's far plane. From the tower deck you can
 * see over the boundary forest; without this there was nothing out there at all.
 */
export function buildSkirt() {
  const g = new RingGeometry(MAP_HALF + 1, 700, 72, 1);
  g.rotateX(-Math.PI / 2);
  const mesh = new Mesh(g, new MeshLambertMaterial({ color: C.forestFloor }));
  mesh.position.y = 5.8; // a hair under the rim, so the map's corners cover it
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
