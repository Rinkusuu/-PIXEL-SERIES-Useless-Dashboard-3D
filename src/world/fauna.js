/* ============================================================================
   fauna.js — the animals that live here and don't need you.

   Ducks paddle in a little line on the lake. Now and then a fish jumps,
   leaving a ring. Rabbits hop about the meadow's edge and freeze, then bolt,
   when you come close. A deer grazes where the forest meets the grass and
   lifts its head when you approach; get too close and it walks off into the
   trees. By day only; at night the deer and the rabbits are elsewhere.
   Reduced motion: the ducks drift, nothing jumps or bolts.
   ========================================================================== */

import { Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import { LAKE, WATER_Y, blockHeight, forestDensity, grassDensity, isWater, lakeE } from './layout.js';
import { VoxelGrid, color, grain, mesh, voxelMesh } from './voxel.js';
import { rng } from '../core/util.js';

function duck(drake) {
  const g = new VoxelGrid([-0.2, 0, -0.12], [0.25, 0.3, 0.12], 0.025);
  g.fill([-0.2, 0, -0.12], [0.2, 0.15, 0.12], (x, y, z) => Math.hypot(x / 0.19, (y - 0.06) / 0.09, z / 0.11) < 1, drake ? (i, j) => (j > 4 ? color('#8a8478') : color('#6a5a48')) : grain('#8a6a48', 0.4)); // body
  g.fill([0.08, 0.1, -0.07], [0.22, 0.28, 0.07], (x, y, z) => Math.hypot(x - 0.15, y - 0.2, z) < 0.065, drake ? color('#2a6a4a') : grain('#8a6a48', 0.3)); // head
  g.fillBox(0.2, 0.17, -0.025, 0.26, 0.2, 0.025, color('#e0a030')); // bill
  g.fillBox(0.17, 0.22, -0.065, 0.19, 0.24, 0.065, color('#1a1a1a')); // eyes
  g.fillBox(-0.22, 0.08, -0.04, -0.17, 0.13, 0.04, drake ? color('#2a2a30') : grain('#8a6a48', 0.3)); // tail
  return voxelMesh(g);
}

function rabbitGeometry() {
  const g = new VoxelGrid([-0.15, 0, -0.08], [0.18, 0.32, 0.08], 0.025);
  const fur = grain('#9a8068', 0.4);
  g.fill([-0.15, 0, -0.08], [0.1, 0.18, 0.08], (x, y, z) => Math.hypot(x / 0.13, (y - 0.08) / 0.08, z / 0.075) < 1, fur);
  g.fill([0.05, 0.08, -0.06], [0.18, 0.2, 0.06], (x, y, z) => Math.hypot(x - 0.11, y - 0.14, z) < 0.055, fur);
  for (const z of [-0.025, 0.025]) g.fillBox(0.08, 0.18, z - 0.0125, 0.105, 0.32, z + 0.0125, fur); // ears
  g.fillBox(-0.16, 0.08, -0.025, -0.13, 0.13, 0.025, color('#f4f0e8')); // the tail
  g.fillBox(0.15, 0.15, -0.045, 0.165, 0.165, 0.045, color('#1a1a1a'));
  return mesh(g);
}

function deer() {
  const g = new VoxelGrid([-0.75, 0, -0.2], [0.75, 1.75, 0.2], 0.05);
  const coat = grain('#9a6a3a', 0.4);
  g.fill([-0.55, 0.65, -0.2], [0.45, 1.15, 0.2], (x, y, z) => Math.hypot(x / 0.5, (y - 0.9) / 0.22, z / 0.17) < 1, coat); // body
  for (const [x, z] of [[-0.4, -0.1], [-0.4, 0.1], [0.3, -0.1], [0.3, 0.1]]) g.fillBox(x - 0.04, 0, z - 0.04, x + 0.04, 0.75, z + 0.04, coat); // legs
  const head = new VoxelGrid([-0.2, -0.2, -0.12], [0.35, 0.85, 0.12], 0.05);
  head.fill([-0.1, -0.2, -0.08], [0.1, 0.35, 0.08], (x, y, z) => Math.hypot(x, z) < 0.07, coat); // neck
  head.fill([-0.05, 0.25, -0.1], [0.3, 0.45, 0.1], (x, y, z) => Math.hypot((x - 0.1) / 0.17, (y - 0.35) / 0.09, z / 0.08) < 1, coat); // head
  head.fillBox(0.25, 0.3, -0.03, 0.32, 0.36, 0.03, color('#2a2020')); // nose
  for (const z of [-0.08, 0.08]) {
    head.fillBox(-0.02, 0.42, z - 0.025, 0.03, 0.75, z + 0.025, color('#c8b090')); // antlers
    head.fillBox(-0.12, 0.6, z - 0.02, 0.03, 0.64, z + 0.02, color('#c8b090'));
  }
  g.fillBox(-0.6, 0.95, -0.05, -0.52, 1.05, 0.05, color('#f4f0e8')); // the white tail
  const body = voxelMesh(g);
  const neck = voxelMesh(head);
  neck.position.set(0.42, 1.0, 0);
  const d = new Group();
  d.add(body, neck);
  d.userData.neck = neck;
  return d;
}

export class Fauna {
  constructor(scene, ripples, player) {
    this.ripples = ripples;
    this.player = player;
    const r = rng(8080);
    this.r = r;

    // ── Ducks: a mother and four, in a loose line, on a slow loop round the lake ──
    this.ducks = Array.from({ length: 5 }, (_, i) => {
      const m = duck(i === 0);
      if (i > 0) m.scale.setScalar(0.7);
      scene.add(m);
      return { m, lag: i * 0.9 };
    });
    this.duckT = 0;

    // ── Rabbits: instanced, around the meadow's edges ──
    this.rabbitMesh = new InstancedMesh(rabbitGeometry(), new MeshLambertMaterial({ vertexColors: true }), 10);
    this.rabbitMesh.castShadow = true;
    scene.add(this.rabbitMesh);
    this.rabbits = [];
    for (let tries = 0; this.rabbits.length < 10 && tries < 4000; tries++) {
      const x = (r() * 2 - 1) * 100;
      const z = (r() * 2 - 1) * 100;
      const fd = forestDensity(x, z);
      if (grassDensity(x, z) > 0.3 && fd > 0.05 && fd < 0.5) this.rabbits.push({ x, z, home: { x, z }, yaw: r() * 6.28, hop: 0, wait: r() * 3, flee: 0 });
    }

    // ── Deer: two, grazing where the forest meets the grass ──
    this.deer = [];
    for (let tries = 0; this.deer.length < 2 && tries < 4000; tries++) {
      const x = (r() * 2 - 1) * 95;
      const z = (r() * 2 - 1) * 95;
      const fd = forestDensity(x, z);
      if (fd > 0.04 && fd < 0.14 && grassDensity(x, z) > 0.4 && !isWater(x, z) && this.deer.every((d) => Math.hypot(d.x - x, d.z - z) > 40)) {
        const g = deer();
        scene.add(g);
        this.deer.push({ g, x, z, yaw: r() * 6.28, graze: r() * 6, alarm: 0, walk: 0 });
      }
    }

    // ── A jumping fish: one at a time, every 8–20 s, somewhere on the open lake ──
    const fg = new VoxelGrid([-0.2, -0.06, -0.04], [0.2, 0.06, 0.04], 0.02);
    fg.fill([-0.2, -0.06, -0.04], [0.2, 0.06, 0.04], (x, y, z) => Math.hypot(x / 0.17, y / 0.055, z / 0.035) < 1 || (x < -0.14 && Math.abs(y) < (-0.14 - x) * 1.6), (i, j) => (j > 3 ? color('#8a9aa8') : color('#c8d0d8')));
    this.fish = voxelMesh(fg);
    this.fish.visible = false;
    scene.add(this.fish);
    this.fishT = -1;
    this.fishWait = 8 + r() * 12;
    this._o = new Object3D();
  }

  update(env, dt) {
    const m = env.motion;
    const day = env.pal.lum > 0.35;
    const p = this.player.pos;

    // Ducks paddle an ellipse inside the lake; reduced motion: they still drift, slowly.
    this.duckT += dt * (m ? 0.012 : 0.004);
    for (const d of this.ducks) {
      const a = this.duckT * Math.PI * 2 - d.lag * 0.05;
      const x = LAKE.x + Math.cos(a) * LAKE.rx * 0.55;
      const z = LAKE.z + Math.sin(a) * LAKE.rz * 0.5;
      d.m.position.set(x, WATER_Y - 0.03 + Math.sin(env.t * 2 + d.lag) * 0.01 * m, z);
      d.m.rotation.y = -a - Math.PI; // heading along the loop
    }

    // The jumping fish.
    if (this.fishT < 0) {
      this.fishWait -= dt;
      if (this.fishWait <= 0 && m) {
        this.fishWait = 8 + this.r() * 12;
        for (let k = 0; k < 10; k++) {
          const x = LAKE.x + (this.r() * 2 - 1) * LAKE.rx * 0.7;
          const z = LAKE.z + (this.r() * 2 - 1) * LAKE.rz * 0.7;
          if (lakeE(x, z) < 0.8) {
            this.fishT = 0;
            this.fishAt = { x, z, yaw: this.r() * 6.28 };
            this.ripples.spawn(x, z, 0.5);
            break;
          }
        }
      }
    } else {
      this.fishT += dt / 0.9;
      const f = this.fishAt;
      const t = Math.min(1, this.fishT);
      const along = (t - 0.5) * 0.8;
      this.fish.visible = t < 1;
      this.fish.position.set(f.x + Math.sin(f.yaw) * along, WATER_Y + Math.sin(t * Math.PI) * 0.7, f.z + Math.cos(f.yaw) * along);
      this.fish.rotation.set(0, f.yaw + Math.PI / 2, (0.5 - t) * 2.2);
      if (t >= 1) {
        this.ripples.spawn(f.x + Math.sin(f.yaw) * 0.4, f.z + Math.cos(f.yaw) * 0.4, 0.6);
        this.fishT = -1;
      }
    }

    // Rabbits: hop between pauses; bolt from you if you come within 5 m.
    const o = this._o;
    this.rabbitMesh.visible = day;
    this.rabbits.forEach((b, i) => {
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const near = Math.hypot(dx, dz);
      if (near < 5 && b.flee <= 0 && m) {
        b.flee = 1.8;
        b.yaw = Math.atan2(dx, dz);
      }
      let hopH = 0;
      if (m && (b.flee > 0 || (b.wait -= dt) <= 0)) {
        b.hop += dt * (b.flee > 0 ? 4 : 2.2);
        const speed = b.flee > 0 ? 3.2 : 0.8;
        const nx = b.x + Math.sin(b.yaw) * speed * dt;
        const nz = b.z + Math.cos(b.yaw) * speed * dt;
        if (!isWater(nx, nz) && Math.hypot(nx - b.home.x, nz - b.home.z) < 14) {
          b.x = nx;
          b.z = nz;
        } else b.yaw += Math.PI * 0.6;
        hopH = Math.abs(Math.sin(b.hop * Math.PI)) * (b.flee > 0 ? 0.25 : 0.12);
        if (b.hop >= 1 && b.flee <= 0) {
          b.hop = 0;
          b.wait = 1 + this.r() * 4;
          b.yaw += (this.r() - 0.5) * 2;
        }
      }
      b.flee = Math.max(0, b.flee - dt);
      o.position.set(b.x, blockHeight(b.x, b.z) + hopH, b.z);
      o.rotation.set(0, b.yaw - Math.PI / 2, 0);
      o.scale.setScalar(1);
      o.updateMatrix();
      this.rabbitMesh.setMatrixAt(i, o.matrix);
    });
    this.rabbitMesh.instanceMatrix.needsUpdate = true;

    // Deer: graze (head down), look up when you're near, walk off if you come close.
    for (const d of this.deer) {
      d.g.visible = day;
      const dx = d.x - p.x;
      const dz = d.z - p.z;
      const near = Math.hypot(dx, dz);
      d.alarm = near < 22 ? Math.min(1, d.alarm + dt * 2) : Math.max(0, d.alarm - dt * 0.5);
      if (near < 9 && m) {
        d.yaw = Math.atan2(dx, dz);
        d.walk = 3;
      }
      if (d.walk > 0) {
        d.walk -= dt;
        const nx = d.x + Math.sin(d.yaw) * 1.6 * dt;
        const nz = d.z + Math.cos(d.yaw) * 1.6 * dt;
        if (!isWater(nx, nz)) {
          d.x = nx;
          d.z = nz;
        }
      }
      d.graze += dt;
      const down = d.alarm > 0.5 ? 0 : 0.5 + 0.5 * Math.sin(d.graze * 0.4);
      d.g.position.set(d.x, blockHeight(d.x, d.z), d.z);
      d.g.rotation.y = d.yaw - Math.PI / 2;
      d.g.userData.neck.rotation.z = -down * 1.6; // head to the grass
    }
  }
}
