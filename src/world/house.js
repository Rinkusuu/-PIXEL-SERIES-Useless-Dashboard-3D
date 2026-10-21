/* ============================================================================
   house.js — the cabin: the one lit window of the classic scene, walked into.

   One room under a gable roof, a sleeping loft at the back reached by a
   ladder, a hearth on the east wall, a kitchen counter under the loft, and a
   porch along the north wall where the door is. Everything is blocks; the
   things that stand for the dashboard's panels arrive in P3.

   This file also tells the collision where the walls, floors and the loft
   are, because nobody else knows.
   ========================================================================== */

import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { CABIN, SPOTS } from './layout.js';
import { VoxelGrid, blocks, courses, grain, planks, voxelMesh } from './voxel.js';
import { LAYER_GLOW, linear } from './renderer.js';
import { clamp, mixRgb } from '../core/util.js';

const T = 0.2; // wall thickness
const LOG = courses('#9a6a44', 3); // a log course every 30 cm, seams between
const DARK = grain('#5e4030', 0.4);
const FLOOR = planks('#a0764e', 0, 2);
const STONE = blocks('#8d8d96');
const ROOF = courses('#7a4a3a', 2); // shingle rows

/** An unlit box (things that glow): not voxels, because their colour changes every frame. */
function glowBox(x0, y0, z0, x1, y1, z1, hex) {
  const m = new Mesh(new BoxGeometry(x1 - x0, y1 - y0, z1 - z0), new MeshBasicMaterial({ color: hex }));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}

export class House {
  /** @param {Collision} col */
  constructor(col) {
    this.group = new Group();
    this.panes = [];
    this.glows = []; // hearth fire and lamp bulb: unlit, on the glow layer
    this.interactables = [];
    this.col = col;
    // One grid for the whole cabin, 10 cm voxels: one mesh, one draw call.
    this.grid = new VoxelGrid([CABIN.x0 - 1, CABIN.groundY - 0.5, CABIN.porch.z0 - 0.5], [CABIN.x1 + 1.5, CABIN.ridgeY + 1.3, CABIN.z1 + 1.1]);
    this._build();
    this.shell = voxelMesh(this.grid); // also what blocks your gaze: you can't use things through a wall
    this.group.add(this.shell);
  }

  _box(x0, y0, z0, x1, y1, z1, paint) {
    this.grid.fillBox(x0, y0, z0, x1, y1, z1, paint);
  }

  _add(mesh) {
    this.group.add(mesh);
    return mesh;
  }

  /** A wall along x at depth z, with rectangular openings [{ a, b, lo, hi }] in x and y. */
  _wallX(z, xa, xb, y0, y1, openings = []) {
    let x = xa;
    for (const o of [...openings].sort((p, q) => p.a - q.a)) {
      if (o.a > x) this._box(x, y0, z - T / 2, o.a, y1, z + T / 2, LOG);
      if (o.lo > y0) this._box(o.a, y0, z - T / 2, o.b, o.lo, z + T / 2, LOG);
      if (o.hi < y1) this._box(o.a, o.hi, z - T / 2, o.b, y1, z + T / 2, LOG);
      if (o.pane) this._pane(o, z, 'x');
      x = o.b;
    }
    if (xb > x) this._box(x, y0, z - T / 2, xb, y1, z + T / 2, LOG);
  }

  /** A wall along z at x. */
  _wallZ(x, za, zb, y0, y1, openings = []) {
    let z = za;
    for (const o of [...openings].sort((p, q) => p.a - q.a)) {
      if (o.a > z) this._box(x - T / 2, y0, z, x + T / 2, y1, o.a, LOG);
      if (o.lo > y0) this._box(x - T / 2, y0, o.a, x + T / 2, o.lo, o.b, LOG);
      if (o.hi < y1) this._box(x - T / 2, o.hi, o.a, x + T / 2, y1, o.b, LOG);
      if (o.pane) this._pane(o, x, 'z');
      z = o.b;
    }
    if (zb > z) this._box(x - T / 2, y0, z, x + T / 2, y1, zb, LOG);
  }

  /** A window pane. By day it shows a pale sky; after dark it glows (see update). */
  _pane(o, at, axis) {
    const g = new PlaneGeometry(o.b - o.a, o.hi - o.lo);
    const m = new Mesh(g, new MeshBasicMaterial({ color: 0x334455, side: DoubleSide }));
    const c = (o.a + o.b) / 2;
    const y = (o.lo + o.hi) / 2;
    if (axis === 'x') m.position.set(c, y, at);
    else {
      m.position.set(at, y, c);
      m.rotation.y = Math.PI / 2;
    }
    this.panes.push(this._add(m));
    // A cross of glazing bars, so it reads as a window and not a screen.
    if (axis === 'x') {
      this._box(c - 0.05, o.lo, at - 0.05, c + 0.05, o.hi, at + 0.05, DARK);
      this._box(o.a, y - 0.05, at - 0.05, o.b, y + 0.05, at + 0.05, DARK);
    } else {
      this._box(at - 0.05, o.lo, c - 0.05, at + 0.05, o.hi, c + 0.05, DARK);
      this._box(at - 0.05, y - 0.05, o.a, at + 0.05, y + 0.05, o.b, DARK);
    }
  }

  /** The triangle of wall under the roof at each end, stepped like everything else. */
  _gable(x) {
    const top = CABIN.floorY + CABIN.wallH;
    const slope = (CABIN.ridgeY - top) / (CABIN.ridgeZ - CABIN.z0);
    this.grid.fill(
      [x - T / 2, top, CABIN.z0 - T / 2], [x + T / 2, CABIN.ridgeY, CABIN.z1 + T / 2],
      (px, py, pz) => py <= CABIN.ridgeY - Math.abs(pz - CABIN.ridgeZ) * slope,
      LOG,
    );
  }

  /** Two roof slopes as voxel terraces, with an eave overhang and a ridge cap. */
  _roof() {
    const top = CABIN.floorY + CABIN.wallH;
    const over = 0.7;
    const run = CABIN.ridgeZ - CABIN.z0;
    const slope = (CABIN.ridgeY - top) / run;
    this.grid.fill(
      [CABIN.x0 - 0.6, top - over * slope - 0.3, CABIN.z0 - over], [CABIN.x1 + 0.6, CABIN.ridgeY + 0.3, CABIN.z1 + over],
      (px, py, pz) => {
        const roofY = CABIN.ridgeY - Math.abs(pz - CABIN.ridgeZ) * slope;
        return py > roofY - 0.02 && py < roofY + 0.2;
      },
      ROOF,
    );
    this._box(CABIN.x0 - 0.6, CABIN.ridgeY, CABIN.ridgeZ - 0.15, CABIN.x1 + 0.6, CABIN.ridgeY + 0.3, CABIN.ridgeZ + 0.15, DARK);
  }

  _build() {
    const { x0, x1, z0, z1, floorY: f, groundY: gy, loftY, door } = CABIN;
    const top = f + CABIN.wallH;
    const col = this.col;
    const dx0 = door.x - door.w / 2;
    const dx1 = door.x + door.w / 2;

    // ── Foundation, floor, porch ──────────────────────────────────────────
    this._box(x0 - 0.3, gy - 0.4, z0 - 0.3, x1 + 0.3, f - 0.08, z1 + 0.3, STONE);
    this._box(x0, f - 0.1, z0, x1, f, z1, FLOOR);
    this._box(x0 - 0.2, f - 0.12, CABIN.porch.z0, x1 + 0.2, f, z0, FLOOR);
    for (const px of [x0 - 0.1, x1 + 0.1]) {
      this._box(px - 0.1, gy - 0.3, CABIN.porch.z0 - 0.1, px + 0.1, f, CABIN.porch.z0 + 0.1, DARK);
    }
    col.addSurface(x0, z0, x1, z1, f);
    col.addSurface(x0 - 0.2, CABIN.porch.z0, x1 + 0.2, z0, f);

    // ── Walls ─────────────────────────────────────────────────────────────
    const win = (a, b, lo, hi) => ({ a, b, lo: f + lo, hi: f + hi, pane: true });
    this._wallX(z0, x0 - T / 2, x1 + T / 2, f, top, [
      { a: dx0, b: dx1, lo: f, hi: f + door.h },
      win(1.2, 2.8, 1.0, 2.1),
      win(7.4, 9.0, 1.0, 2.1),
    ]);
    this._wallX(z1, x0 - T / 2, x1 + T / 2, f, top, [win(7.2, 8.6, 1.2, 2.0)]);
    this._wallZ(x0, z0, z1, f, top, [win(76.4, 79.0, 1.0, 2.2)]); // the lake window
    this._wallZ(x1, z0, z1, f, top);
    this._gable(x0);
    this._gable(x1);
    this._roof();

    const wallY0 = gy - 1;
    const wallY1 = CABIN.ridgeY;
    col.addSeg(x0, z0, dx0, z0, wallY0, wallY1);
    col.addSeg(dx1, z0, x1, z0, wallY0, wallY1);
    col.addSeg(x1, z0, x1, z1, wallY0, wallY1);
    col.addSeg(x1, z1, x0, z1, wallY0, wallY1);
    col.addSeg(x0, z1, x0, z0, wallY0, wallY1);

    // ── The door ──────────────────────────────────────────────────────────
    const hinge = new Group();
    hinge.position.set(dx0, f, z0);
    // The door is its own little grid, in hinge space, so it can swing.
    const dg = new VoxelGrid([0, 0, -0.1], [door.w, door.h, 0.1]);
    dg.fillBox(0, 0, -0.05, door.w, door.h, 0.05, planks('#5e4030', 0, 3));
    dg.fillBox(door.w - 0.2, 1.0, -0.1, door.w - 0.1, 1.1, 0.1, grain('#d8c070', 0.3)); // the latch
    const slab = voxelMesh(dg);
    hinge.add(slab);
    this._add(hinge);
    this.door = { hinge, slab, open: false, angle: 0 };
    this.doorClosed = col.addSeg(dx0, z0, dx1, z0, wallY0, wallY1);
    // Open, the slab swings inward against the wall to its left.
    this.doorOpen = col.addSeg(dx0, z0, dx0, z0 + door.w, f, f + door.h);
    this.doorOpen.on = false;
    this.interactables.push({
      object: slab,
      label: () => (this.door.open ? 'Close the door' : 'Open the door'),
      use: () => this.toggleDoor(),
    });

    // ── Hearth and chimney ────────────────────────────────────────────────
    this._box(x1 - 1.1, f, 76.2, x1, f + 1.4, 77.8, STONE);
    this._box(x1 - 0.8, f + 1.4, 76.4, x1, top + 0.1, 77.6, STONE); // breast up to the ceiling
    this._box(x1, gy - 0.3, 76.3, x1 + 0.9, CABIN.ridgeY + 1.0, 77.7, STONE);
    const fire = glowBox(x1 - 1.05, f + 0.05, 76.6, x1 - 0.55, f + 0.55, 77.4, 0xff9a4a);
    fire.castShadow = false;
    fire.layers.set(LAYER_GLOW);
    this.fire = this._add(fire);
    col.addBox(x1 - 1.15, 76.15, x1, 77.85, f - 0.1, top);
    col.addBox(x1, 76.3, x1 + 0.9, 77.7, wallY0, wallY1);

    // ── Table, chairs, lamp, rug ──────────────────────────────────────────
    // South of the doorway, so the way in is clear.
    const tx0 = 4.2, tx1 = 5.8, tz0 = 76.0, tz1 = 77.2;
    this._box(tx0, f + 0.7, tz0, tx1, f + 0.78, tz1, LOG);
    for (const [lx, lz] of [[tx0 + 0.1, tz0 + 0.1], [tx1 - 0.1, tz0 + 0.1], [tx0 + 0.1, tz1 - 0.1], [tx1 - 0.1, tz1 - 0.1]]) {
      this._box(lx - 0.05, f, lz - 0.05, lx + 0.05, f + 0.7, lz + 0.05, DARK);
    }
    col.addBox(tx0, tz0, tx1, tz1, f, f + 0.8);
    for (const cz of [tz0 - 0.55, tz1 + 0.55]) {
      this._box(4.75, f + 0.42, cz - 0.22, 5.25, f + 0.48, cz + 0.22, DARK);
      this._box(4.75, f, cz - 0.2, 5.25, f + 0.42, cz + 0.2, DARK);
      col.addCircle(5, cz, 0.28, f, f + 0.9);
    }
    this._box(4.98, f + 2.2, 76.58, 5.02, top, 76.62, DARK); // the lamp's cord
    const bulb = glowBox(4.85, f + 2.05, 76.45, 5.15, f + 2.25, 76.75, 0xffcf7a);
    bulb.castShadow = false;
    this.bulb = this._add(bulb);
    this._box(3.4, f, 75.4, 6.6, f + 0.1, 77.8, grain('#a85a4a', 0.5)); // the rug: one voxel thick, so it's a step you won't notice

    // ── Shelf and kitchen counter, under the loft ─────────────────────────
    // An open shelf: back, two sides, boards. (A solid block swallowed the coin jar.)
    this._box(x0 + 0.1, f, 79.4, x0 + 0.2, f + 2.0, 81.6, LOG);
    for (const sz of [79.4, 81.5]) this._box(x0 + 0.1, f, sz, x0 + 0.55, f + 2.0, sz + 0.1, LOG);
    for (const sy of [0.5, 1.1, 1.7]) this._box(x0 + 0.1, f + sy, 79.4, x0 + 0.55, f + sy + 0.05, 81.6, DARK);
    col.addBox(x0, 79.4, x0 + 0.55, 81.6, f, f + 2);
    this._box(6.0, f, z1 - 0.65, 10.4, f + 0.9, z1 - 0.1, LOG);
    this._box(5.95, f + 0.9, z1 - 0.7, 10.45, f + 0.96, z1 - 0.1, STONE);
    col.addBox(6.0, z1 - 0.7, 10.45, z1, f, f + 1);

    // ── Loft, rail, ladder, bed ───────────────────────────────────────────
    const rz = CABIN.ridgeZ;
    const lad = CABIN.ladder;
    this._box(x0, loftY - 0.16, rz, x1, loftY, z1, FLOOR);
    this._box(x0 + 3.9, f, rz + 0.05, x0 + 4.1, loftY - 0.16, rz + 0.25, DARK); // a post under the loft edge
    col.addCircle(x0 + 4, rz + 0.15, 0.15, f, loftY);
    col.addSurface(x0, rz, x1, z1, loftY);
    const gap0 = lad.x - lad.w / 2;
    const gap1 = lad.x + lad.w / 2;
    for (const [a, b] of [[x0, gap0], [gap1, x1]]) {
      this._box(a, loftY + 0.85, rz - 0.05, b, loftY + 0.95, rz + 0.05, DARK);
      for (let px = a + 0.05; px < b; px += 0.6) this._box(px - 0.03, loftY, rz - 0.03, px + 0.03, loftY + 0.9, rz + 0.03, DARK);
      col.addSeg(a, rz, b, rz, loftY - 0.1, loftY + 1.2);
    }
    // Ladder: two rails and rungs, from the floor up over the loft edge.
    const lift = loftY - f;
    const runZ = lad.z1 - lad.z0;
    const climb = lift + 0.9;
    for (const sx of [gap0 + 0.05, gap1 - 0.05]) {
      // A slanted rail: every voxel within reach of the line from floor to loft edge.
      this.grid.fill([sx - 0.05, f, lad.z0], [sx + 0.05, f + climb, lad.z1], (px, py, pz) => {
        const t = (pz - lad.z0) / runZ;
        return Math.abs(py - (f + t * climb)) < 0.09;
      }, DARK);
    }
    for (let k = 1; k <= 8; k++) {
      const t = k / 9;
      this._box(gap0 + 0.05, f + t * climb - 0.05, lad.z0 + t * runZ - 0.05, gap1 - 0.05, f + t * climb + 0.05, lad.z0 + t * runZ + 0.05, DARK);
    }
    col.addSurface(gap0, lad.z0, gap1, lad.z1, (x, z) => f + clamp((z - lad.z0) / runZ, 0, 1) * lift);
    col.addSeg(gap0, lad.z0, gap0, lad.z1, f + 0.1, loftY + 1.2);
    col.addSeg(gap1, lad.z0, gap1, lad.z1, f + 0.1, loftY + 1.2);

    // The roof comes down over the back of the loft; keep heads out of it.
    col.addSeg(x0, 80.7, x1, 80.7, loftY - 0.1, loftY + 2);

    const bed = SPOTS.bed;
    this._box(bed.x - 1.2, loftY, bed.z - 0.2, bed.x + 1.2, loftY + 0.3, bed.z + 1.0, DARK);
    this._box(bed.x - 1.15, loftY + 0.3, bed.z - 0.15, bed.x + 1.15, loftY + 0.45, bed.z + 0.95, grain('#e8e0d0', 0.3));
    this._box(bed.x - 1.15, loftY + 0.45, bed.z - 0.15, bed.x + 0.5, loftY + 0.52, bed.z + 0.95, grain('#6a86b8', 0.3)); // the blanket
    this._box(bed.x + 0.6, loftY + 0.45, bed.z - 0.05, bed.x + 1.1, loftY + 0.6, bed.z + 0.85, grain('#f4efe4', 0.3)); // the pillow
    col.addBox(bed.x - 1.2, bed.z - 0.2, bed.x + 1.2, bed.z + 1.0, loftY, loftY + 0.6);

    // ── The bench on the porch: its own mesh, so you can look at it and sit ──
    const b = SPOTS.bench;
    const bg = new VoxelGrid([b.x - 1, f, b.z - 0.3], [b.x + 1, f + 0.6, b.z + 0.3]);
    bg.fillBox(b.x - 0.9, f + 0.4, b.z - 0.22, b.x + 0.9, f + 0.5, b.z + 0.22, planks('#9a6a44', 0, 2));
    for (const lx of [b.x - 0.75, b.x + 0.75]) bg.fillBox(lx - 0.05, f, b.z - 0.2, lx + 0.05, f + 0.4, b.z + 0.2, DARK);
    this.bench = voxelMesh(bg);
    this.group.add(this.bench);
    // Sitting faces north, over the yard and the meadow; standing up puts you back on the porch.
    this.benchSeat = { x: b.x, z: b.z, y: f + 0.5, yaw: 0, standZ: b.z - 0.7 };
    col.addBox(b.x - 0.9, b.z - 0.22, b.x + 0.9, b.z + 0.22, f, f + 0.5);
  }

  toggleDoor() {
    this.door.open = !this.door.open;
    this.doorClosed.on = !this.door.open;
    this.doorOpen.on = this.door.open;
  }

  /** Called every frame: the door swings, the hearth flickers, the windows glow after dark. */
  update(env, dt) {
    const target = this.door.open ? -Math.PI / 2 : 0;
    const d = this.door;
    // Reduced motion: the door is simply open or shut, no swing.
    d.angle = env.motion ? d.angle + (target - d.angle) * Math.min(1, dt * 6) : target;
    d.hinge.rotation.y = d.angle;

    const { pal } = env;
    const dark = clamp(1 - pal.lum * 1.4, 0, 1);
    const flick = 0.85 + 0.15 * Math.sin(env.t * 9.1) * Math.sin(env.t * 4.3 + 0.6) * (env.motion ? 1 : 0.3);
    linear(mixRgb([255, 140, 60], [255, 210, 120], flick - 0.7), this.fire.material.color);

    // The window you saw from the meadow in the classic scene, lit from inside.
    const lit = mixRgb(mixRgb(pal.sky[1], [40, 50, 70], 0.55), [255, 200, 120], dark);
    for (const p of this.panes) {
      linear(lit, p.material.color);
      p.layers.set(dark > 0.3 ? LAYER_GLOW : 0);
    }
    linear(mixRgb([120, 110, 90], [255, 207, 122], dark), this.bulb.material.color);
    this.bulb.layers.set(dark > 0.3 ? LAYER_GLOW : 0);
  }
}
