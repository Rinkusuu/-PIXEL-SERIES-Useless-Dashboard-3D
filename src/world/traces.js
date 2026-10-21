/* ============================================================================
   traces.js — the old data, standing in the world.

   A bucket at the end of the dock holds what you've caught (a little voxel
   fish for each, up to a dozen; boots included). A buoy floats as far out
   from the stone pile as your best throw skipped. Both are rebuilt when the
   numbers change, from the same store the classic panels read.
   ========================================================================== */

import { Group, Vector3 } from 'three';
import { bus } from '../core/bus.js';
import { store } from '../core/store.js';
import { DOCK, LAKE, SPOTS, WATER_Y } from './layout.js';
import { VoxelGrid, color, grain, mesh, voxelMesh } from './voxel.js';

const FISH_COLOR = { minnow: '#a8b8c8', perch: '#c8a040', carp: '#d0703c', eel: '#5a6a4a', boot: '#4a3a2a', can: '#8a8a90', moon: '#e8eef8', star: '#f0d070' };

export class Traces {
  constructor(scene) {
    this.group = new Group();
    scene.add(this.group);
    this.bucketAt = { x: DOCK.x - DOCK.w / 2 + 0.35, y: DOCK.y, z: DOCK.z1 + 1.2 };
    this.bucket = null;
    this.buoy = null;
    this._buildBucket();
    this._buildBuoy();
    bus.on('fish', () => this._buildBucket());
    bus.on('skip', () => this._buildBuoy());
  }

  /** Rebuilt in place: the mesh stays the same object, so it stays something you can look at. */
  _buildBucket() {
    const { x, y, z } = this.bucketAt;
    const g = new VoxelGrid([x - 0.2, y, z - 0.2], [x + 0.2, y + 0.45, z + 0.2], 0.025);
    g.fill([x - 0.2, y, z - 0.2], [x + 0.2, y + 0.35, z + 0.2], (px, py, pz) => {
      const r = Math.hypot(px - x, pz - z);
      return r < 0.17 && (r > 0.14 || py < y + 0.03);
    }, grain('#6a7a8a', 0.3));
    g.fillBox(x - 0.17, y + 0.33, z - 0.0125, x + 0.17, y + 0.36, z + 0.0125, color('#3a3a44')); // the handle
    const catches = (store.get('catches') || []).slice(-12);
    catches.forEach((id, i) => {
      const a = (i / 12) * Math.PI * 2;
      const fx = x + Math.cos(a) * 0.07;
      const fz = z + Math.sin(a) * 0.07;
      const fy = y + 0.28 + (i % 3) * 0.03; // heaped, so the catch peeks over the rim
      const c = color(FISH_COLOR[id] ?? '#a8b8c8');
      g.fillBox(fx - 0.05, fy, fz - 0.0125, fx + 0.05, fy + 0.025, fz + 0.0125, c);
    });
    if (!this.bucket) {
      this.bucket = voxelMesh(g);
      this.group.add(this.bucket);
    } else {
      this.bucket.geometry.dispose();
      this.bucket.geometry = mesh(g);
    }
  }

  /** The buoy sits out on the lake, as far as the best throw went (two and a bit metres a skip). */
  _buildBuoy() {
    if (this.buoy) this.group.remove(this.buoy);
    const best = store.get('skips') || 0;
    if (!best) return;
    const from = new Vector3(SPOTS.stones.x, 0, SPOTS.stones.z);
    const dir = new Vector3(LAKE.x, 0, LAKE.z).sub(from).normalize();
    const p = from.addScaledVector(dir, Math.min(45, 4 + best * 2.4));
    const g = new VoxelGrid([p.x - 0.2, WATER_Y - 0.1, p.z - 0.2], [p.x + 0.2, WATER_Y + 0.5, p.z + 0.2], 0.05);
    g.fill([p.x - 0.2, WATER_Y - 0.1, p.z - 0.2], [p.x + 0.2, WATER_Y + 0.3, p.z + 0.2], (x, y, z) => Math.hypot(x - p.x, y - WATER_Y - 0.08, z - p.z) < 0.18, (i, j) => (j % 4 < 2 ? color('#d0503c') : color('#f4efe4')));
    g.fillBox(p.x - 0.025, WATER_Y + 0.25, p.z - 0.025, p.x + 0.025, WATER_Y + 0.5, p.z + 0.025, color('#3a3a44'));
    this.buoy = voxelMesh(g);
    this.group.add(this.buoy);
  }

  /** The buoy bobs a little (a fixed pose under reduced motion). */
  update(env) {
    if (this.buoy) this.buoy.position.y = Math.sin(env.t * 1.3) * 0.03 * env.motion;
  }
}

