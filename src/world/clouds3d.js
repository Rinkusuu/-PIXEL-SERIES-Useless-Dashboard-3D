/* ============================================================================
   clouds3d.js — voxel clouds, in the background pass with the sky.

   A handful of big blocky cumulus shapes, scattered round the sky above the
   ridges and drifting with the real wind. How many and how dark comes from
   the real weather: a few white puffs on a clear day, a heavy grey deck in
   the rain, almost none in fog (the fog is the cloud). They take the
   palette's light — gold at dusk, blue-grey at night — and hide the stars and
   the sun when they pass in front. Reduced motion holds them still.
   ========================================================================== */

import { Color, InstancedMesh, MeshBasicMaterial, Object3D } from 'three';
import { VoxelGrid, color, mesh } from './voxel.js';
import { linear } from './renderer.js';
import { mixRgb, noise2, rng } from '../core/util.js';

const MAX = 34;
const SHAPES = 3;

/** One cloud shape, 1-unit voxels, bottom flat-ish and top lumpy; shaded lighter on top. */
function cloudGeometry(seed) {
  const r = rng(seed);
  const g = new VoxelGrid([-14, 0, -8], [14, 9, 8], 1);
  const blobs = Array.from({ length: 6 }, () => [(r() - 0.5) * 18, 2 + r() * 2, (r() - 0.5) * 8, 3 + r() * 3.5]);
  g.fill([-14, 0, -8], [14, 9, 8], (x, y, z) => blobs.some(([bx, by, bz, br]) => Math.hypot(x - bx, (y - by) * 1.3, z - bz) < br * (0.85 + 0.3 * noise2(x * 0.3 + seed, z * 0.3 + y * 0.2, 71))) && y > 0.5, color('#ffffff'));
  const geo = mesh(g);
  const n = geo.attributes.normal;
  const c = geo.attributes.color;
  for (let i = 0; i < c.count; i++) {
    const k = 0.72 + 0.28 * Math.max(0, n.getY(i)) - 0.12 * Math.max(0, -n.getY(i)); // lit from above, shadowed below
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return geo;
}

export class Clouds {
  constructor(skyScene) {
    this.material = new MeshBasicMaterial({ vertexColors: true, fog: false });
    this.shapes = Array.from({ length: SHAPES }, (_, i) => {
      const m = new InstancedMesh(cloudGeometry(i * 31 + 5), this.material, MAX);
      m.frustumCulled = false;
      m.renderOrder = 1.5; // after the bodies' depth, before the ridges
      m.count = 0;
      skyScene.add(m);
      return m;
    });
    const r = rng(404);
    // Golden-angle azimuths: any first n clouds are spread evenly round the sky,
    // so a thin cover is a few clouds everywhere, not a clump on one side.
    this.clouds = Array.from({ length: MAX * SHAPES }, (_, i) => ({
      az: i * 2.399963 + (r() - 0.5) * 0.3,
      dist: 520 + r() * 520,
      h: 230 + r() * 170,
      scale: 5 + r() * 5,
      yaw: Math.round(r() * 4) * (Math.PI / 2),
    }));
    this.cover = null; // eased 0–1; starts where the weather is (the sky didn't clear when you opened the tab)
    this._o = new Object3D();
    this._c = new Color();
  }

  update(env, dt) {
    const want = { clear: 0.3, cloudy: 0.75, rain: 1, storm: 1, snow: 0.85, fog: 0.08 }[env.weather] ?? 0.3;
    if (this.cover === null) this.cover = want;
    this.cover += (want - this.cover) * (1 - Math.exp(-dt * 0.15));
    const grey = { rain: 0.55, storm: 0.7, snow: 0.25, cloudy: 0.2 }[env.weather] ?? 0;

    const { pal } = env;
    // Lit by the sky: white with a touch of the key light by day, the sky's own colour at night.
    let rgb = mixRgb(mixRgb([255, 255, 255], pal.glow, 0.18), pal.sky[1], 0.25 + (1 - pal.lum) * 0.5);
    rgb = mixRgb(rgb, [110, 116, 128], grey * 0.8);
    linear(rgb, this.material.color).multiplyScalar(0.35 + pal.lum * 0.75);

    const n = Math.round(this.cover * MAX);
    const drift = env.wind * 0.0012 * env.motion;
    const o = this._o;
    this.shapes.forEach((m, s) => {
      m.count = n;
      for (let i = 0; i < n; i++) {
        const c = this.clouds[i * SHAPES + s]; // interleaved, so every shape takes its share of each sector
        c.az += drift * dt * 60 * (600 / c.dist);
        // Heavier weather lowers the deck.
        o.position.set(Math.sin(c.az) * c.dist, c.h - grey * 80, -Math.cos(c.az) * c.dist);
        o.rotation.set(0, c.yaw + c.az, 0);
        o.scale.setScalar(c.scale * (1 + grey * 0.5));
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      }
      m.instanceMatrix.needsUpdate = true;
    });
  }
}

