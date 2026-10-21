/* ============================================================================
   leaves3d.js — leaves falling from the big tree, to be caught.

   They spin down from the crown and sway as they stall and slip; how many
   depends on the season (core/season's leafFall: a trickle in spring, a
   blizzard in October) and the wind. Look at one and press E to catch it.
   It was going to land anyway. (The catch itself is core/leaves.js, the same
   one the classic meadow uses.)
   ========================================================================== */

import { Color, InstancedMesh, MeshLambertMaterial, Object3D, Vector3 } from 'three';
import { catchLeaf } from '../core/leaves.js';
import { SPOTS, blockHeight } from './layout.js';
import { VoxelGrid, color, mesh } from './voxel.js';
import { aimPick } from './aim.js';

const MAX = 40;
const CROWN = { r: 3.6, y0: 5.5, y1: 9 }; // the leaf tree is a round tree at scale 2.1
const REACH = 8;

export class Leaves {
  constructor(scene) {
    const g = new VoxelGrid([-0.06, 0, -0.04], [0.06, 0.04, 0.04], 0.04);
    g.fillBox(-0.06, 0, -0.02, 0.06, 0.04, 0.02, color('#ffffff'));
    g.fillBox(-0.02, 0, -0.04, 0.02, 0.04, 0.04, color('#ffffff'));
    this.mesh = new InstancedMesh(mesh(g), new MeshLambertMaterial({ vertexColors: true }), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);

    this.base = { x: SPOTS.leafTree.x, z: SPOTS.leafTree.z, y: blockHeight(SPOTS.leafTree.x, SPOTS.leafTree.z) };
    this.leaves = Array.from({ length: MAX }, () => ({ alive: false, p: new Vector3(), phase: 0, ground: 0 }));
    this.colors = ['#d9822b', '#e8b04a', '#c4532d', '#a8c25a'].map((h) => new Color(h));
    this._spawn = 0;
    this._o = new Object3D();
    this._dirs = this.leaves.map(() => new Vector3());
    this._fwd = new Vector3();
  }

  update(env, dt) {
    const rate = 0.4 * (env.season?.leafFall ?? 1) * (0.5 + env.wind);
    this._spawn += rate * dt;
    for (const l of this.leaves) {
      if (this._spawn < 1) break;
      if (l.alive) continue;
      this._spawn -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * CROWN.r;
      l.p.set(this.base.x + Math.cos(a) * r, this.base.y + CROWN.y0 + Math.random() * (CROWN.y1 - CROWN.y0), this.base.z + Math.sin(a) * r);
      l.phase = Math.random() * 6.28;
      l.ground = blockHeight(l.p.x, l.p.z);
      l.alive = true;
      this.mesh.setColorAt(this.leaves.indexOf(l), this.colors[Math.floor(Math.random() * this.colors.length)]);
      this.mesh.instanceColor.needsUpdate = true;
    }
    this._spawn = Math.min(this._spawn, 1);

    const o = this._o;
    this.leaves.forEach((l, i) => {
      if (l.alive) {
        l.phase += dt;
        // It sways as it stalls and slips: the sideways sine is what makes it a leaf and not a rock.
        l.p.y -= (0.55 + Math.sin(l.phase * 2.3) * 0.25) * dt;
        l.p.x += Math.cos(l.phase * 1.7) * 0.6 * dt * env.motion + env.wind * 0.3 * dt;
        if (l.p.y <= l.ground) l.alive = false;
      }
      o.position.copy(l.alive ? l.p : { x: 0, y: -50, z: 0 });
      o.rotation.set(Math.sin(l.phase * 3) * 0.8, l.phase * 2, 0);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** The falling leaf under the centre dot, within reach; -1 if none. */
  aimed(camera) {
    const c = camera.position;
    if (Math.hypot(c.x - this.base.x, c.z - this.base.z) > CROWN.r + REACH) return -1;
    camera.getWorldDirection(this._fwd);
    this.leaves.forEach((l, i) => this._dirs[i].copy(l.p).sub(c).normalize());
    return aimPick(this._fwd, this._dirs, 5, (i) => this.leaves[i].alive && this.leaves[i].p.distanceTo(c) < REACH);
  }

  catch(i) {
    this.leaves[i].alive = false;
    catchLeaf();
  }
}
