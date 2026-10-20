/* ============================================================================
   terrain.js — the ground mesh, built from layout.heightAt.

   One flat-shaded grid, 2 m cells, coloured per face by what the place is:
   meadow, worn path, sand at the shore, mud under the water, forest floor past the edge.
   The pixel texture adds grain; the palette's lighting does the rest.
   ========================================================================== */

import { BufferAttribute, BufferGeometry, Color, Mesh, MeshLambertMaterial, RingGeometry } from 'three';
import { heightAt, lakeE, pathDist, lineDist, STREAM, MAP_HALF, WALK_RADIUS, forestDensity } from './layout.js';
import { texture } from './textures.js';
import { fbm2 } from '../core/util.js';

const CELL = 2;

const C = {
  grass: new Color('#5f9a4a'),
  grassLight: new Color('#86b85e'),
  forestFloor: new Color('#3f6a3a'),
  path: new Color('#9a7a52'),
  sand: new Color('#cdbb8a'),
  mud: new Color('#6b5a48'),
};

/** The colour of the ground at a point. */
function groundColor(x, z, y, out) {
  const e = lakeE(x, z);
  const r = Math.hypot(x, z);
  const n = fbm2(x * 0.08, z * 0.08, 2, 5);

  out.copy(C.grass).lerp(C.grassLight, n * 0.8);
  out.lerp(C.forestFloor, forestDensity(x, z) * 0.7);
  if (r > WALK_RADIUS + 2) out.lerp(C.forestFloor, Math.min(1, (r - WALK_RADIUS - 2) / 8)); // under the boundary forest

  const p = pathDist(x, z);
  if (p < 1.6) out.lerp(C.path, 1 - Math.max(0, p - 0.9) / 0.7);

  const s = lineDist(x, z, STREAM).d;
  if (s < 2.6) out.lerp(C.mud, 1 - Math.max(0, s - 1.4) / 1.2);

  if (e < 1.12 && y < 1.2) out.lerp(C.sand, Math.min(1, (1.12 - e) / 0.06));
  if (y < -0.15) out.lerp(C.mud, Math.min(1, -y / 1.2));
  return out;
}

export function buildTerrain() {
  const n = Math.round((MAP_HALF * 2) / CELL);
  const H = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) H[j * (n + 1) + i] = heightAt(-MAP_HALF + i * CELL, -MAP_HALF + j * CELL);
  }

  // Non-indexed: each triangle gets its own vertices, so its normal (and its
  // colour) is flat. That is the low-poly look, and it costs nothing extra.
  const tris = n * n * 2;
  const pos = new Float32Array(tris * 9);
  const col = new Float32Array(tris * 9);
  const uv = new Float32Array(tris * 6);
  const c = new Color();
  let v = 0;

  const put = (i, j) => {
    const x = -MAP_HALF + i * CELL;
    const z = -MAP_HALF + j * CELL;
    pos[v * 3] = x;
    pos[v * 3 + 1] = H[j * (n + 1) + i];
    pos[v * 3 + 2] = z;
    uv[v * 2] = x / CELL;
    uv[v * 2 + 1] = z / CELL;
    v++;
  };

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // Alternate the diagonal so the grid doesn't read as stripes.
      const flip = (i + j) % 2 === 0;
      const quads = flip
        ? [[i, j], [i, j + 1], [i + 1, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]
        : [[i, j], [i, j + 1], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i + 1, j]];
      for (let t = 0; t < 2; t++) {
        const start = v;
        for (let k = 0; k < 3; k++) put(...quads[t * 3 + k]);
        // One colour per face, sampled at its centre.
        const cx = (pos[start * 3] + pos[start * 3 + 3] + pos[start * 3 + 6]) / 3;
        const cy = (pos[start * 3 + 1] + pos[start * 3 + 4] + pos[start * 3 + 7]) / 3;
        const cz = (pos[start * 3 + 2] + pos[start * 3 + 5] + pos[start * 3 + 8]) / 3;
        groundColor(cx, cz, cy, c);
        for (let k = 0; k < 3; k++) c.toArray(col, (start + k) * 3);
      }
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.computeVertexNormals();

  const mesh = new Mesh(g, new MeshLambertMaterial({ vertexColors: true, map: texture('ground') }));
  mesh.receiveShadow = true;
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
