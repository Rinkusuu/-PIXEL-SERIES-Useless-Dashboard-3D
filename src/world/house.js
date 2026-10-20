/* ============================================================================
   house.js — the cabin: the one lit window of the classic scene, walked into.

   One room under a gable roof, a sleeping loft at the back reached by a
   ladder, a hearth on the east wall, a kitchen counter under the loft, and a
   porch along the north wall where the door is. Everything is blocks; the
   things that stand for the dashboard's panels arrive in P3.

   This file also tells the collision where the walls, floors and the loft
   are, because nobody else knows.
   ========================================================================== */

import {
  DoubleSide, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Shape,
} from 'three';
import { CABIN, SPOTS } from './layout.js';
import { boxAt, mat } from './build.js';
import { LAYER_GLOW, linear } from './renderer.js';
import { clamp, mixRgb } from '../core/util.js';

const T = 0.2; // wall thickness
const LOG = 'wood:#9a6a44';
const DARK = 'wood:#5e4030';
const FLOOR = 'wood:#a0764e';
const STONE = 'stone:#8d8d96';
const ROOF = 'roof:#7a4a3a';

export class House {
  /** @param {Collision} col */
  constructor(col) {
    this.group = new Group();
    this.panes = [];
    this.glows = []; // hearth fire and lamp bulb: unlit, on the glow layer
    this.interactables = [];
    this.col = col;
    this._build();
  }

  _add(mesh) {
    this.group.add(mesh);
    return mesh;
  }

  /** A wall along x at depth z, with rectangular openings [{ a, b, lo, hi }] in x and y. */
  _wallX(z, xa, xb, y0, y1, openings = []) {
    let x = xa;
    for (const o of [...openings].sort((p, q) => p.a - q.a)) {
      if (o.a > x) this._add(boxAt(x, y0, z - T / 2, o.a, y1, z + T / 2, mat(LOG)));
      if (o.lo > y0) this._add(boxAt(o.a, y0, z - T / 2, o.b, o.lo, z + T / 2, mat(LOG)));
      if (o.hi < y1) this._add(boxAt(o.a, o.hi, z - T / 2, o.b, y1, z + T / 2, mat(LOG)));
      if (o.pane) this._pane(o, z, 'x');
      x = o.b;
    }
    if (xb > x) this._add(boxAt(x, y0, z - T / 2, xb, y1, z + T / 2, mat(LOG)));
  }

  /** A wall along z at x. */
  _wallZ(x, za, zb, y0, y1, openings = []) {
    let z = za;
    for (const o of [...openings].sort((p, q) => p.a - q.a)) {
      if (o.a > z) this._add(boxAt(x - T / 2, y0, z, x + T / 2, y1, o.a, mat(LOG)));
      if (o.lo > y0) this._add(boxAt(x - T / 2, y0, o.a, x + T / 2, o.lo, o.b, mat(LOG)));
      if (o.hi < y1) this._add(boxAt(x - T / 2, o.hi, o.a, x + T / 2, y1, o.b, mat(LOG)));
      if (o.pane) this._pane(o, x, 'z');
      z = o.b;
    }
    if (zb > z) this._add(boxAt(x - T / 2, y0, z, x + T / 2, y1, zb, mat(LOG)));
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
    const bar = mat(DARK);
    if (axis === 'x') {
      this._add(boxAt(c - 0.03, o.lo, at - 0.04, c + 0.03, o.hi, at + 0.04, bar));
      this._add(boxAt(o.a, y - 0.03, at - 0.04, o.b, y + 0.03, at + 0.04, bar));
    } else {
      this._add(boxAt(at - 0.04, o.lo, c - 0.03, at + 0.04, o.hi, c + 0.03, bar));
      this._add(boxAt(at - 0.04, y - 0.03, o.a, at + 0.04, y + 0.03, o.b, bar));
    }
  }

  _gable(x) {
    const s = new Shape();
    const top = CABIN.floorY + CABIN.wallH;
    s.moveTo(CABIN.z0 - T / 2, top);
    s.lineTo(CABIN.z1 + T / 2, top);
    s.lineTo(CABIN.ridgeZ, CABIN.ridgeY);
    s.closePath();
    const g = new ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
    // The shape is drawn in (z, y); turn it so its depth runs along x.
    g.rotateY(-Math.PI / 2);
    g.scale(-1, 1, 1);
    const m = new Mesh(g, mat(LOG));
    m.position.x = x - T / 2;
    m.castShadow = m.receiveShadow = true;
    // ExtrudeGeometry's UVs are in shape units (metres), which is what we want.
    return this._add(m);
  }

  _roof() {
    const top = CABIN.floorY + CABIN.wallH;
    const over = 0.7; // eave overhang
    const run = CABIN.ridgeZ - CABIN.z0;
    const rise = CABIN.ridgeY - top;
    const slope = rise / run;
    const ang = Math.atan2(rise, run);
    const len = Math.hypot(run + over, (run + over) * slope);
    const w = CABIN.x1 - CABIN.x0 + 1.2;
    for (const side of [-1, 1]) {
      const m = boxAt(-w / 2, -0.08, -len / 2, w / 2, 0.08, len / 2, mat(ROOF), 1.2);
      const ez = CABIN.ridgeZ + side * (run + over);
      const ey = CABIN.ridgeY - (run + over) * slope;
      m.position.set((CABIN.x0 + CABIN.x1) / 2, (CABIN.ridgeY + ey) / 2 + 0.1, (CABIN.ridgeZ + ez) / 2);
      m.rotation.x = side * ang;
      this._add(m);
    }
    // The ridge cap.
    this._add(boxAt(CABIN.x0 - 0.6, CABIN.ridgeY, CABIN.ridgeZ - 0.15, CABIN.x1 + 0.6, CABIN.ridgeY + 0.22, CABIN.ridgeZ + 0.15, mat(DARK)));
  }

  _build() {
    const { x0, x1, z0, z1, floorY: f, groundY: gy, loftY, door } = CABIN;
    const top = f + CABIN.wallH;
    const col = this.col;
    const dx0 = door.x - door.w / 2;
    const dx1 = door.x + door.w / 2;

    // ── Foundation, floor, porch ──────────────────────────────────────────
    this._add(boxAt(x0 - 0.3, gy - 0.4, z0 - 0.3, x1 + 0.3, f - 0.08, z1 + 0.3, mat(STONE)));
    this._add(boxAt(x0, f - 0.1, z0, x1, f, z1, mat(FLOOR)));
    this._add(boxAt(x0 - 0.2, f - 0.12, CABIN.porch.z0, x1 + 0.2, f, z0, mat(FLOOR)));
    for (const px of [x0 - 0.1, x1 + 0.1]) {
      this._add(boxAt(px - 0.1, gy - 0.3, CABIN.porch.z0 - 0.1, px + 0.1, f, CABIN.porch.z0 + 0.1, mat(DARK)));
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
    this._gable(x1 + T);
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
    const slab = boxAt(0, 0, -0.04, door.w, door.h, 0.04, mat(DARK));
    slab.userData.label = 'Door';
    hinge.add(slab);
    hinge.add(boxAt(door.w - 0.2, 1.0, -0.1, door.w - 0.12, 1.08, 0.1, mat('#d8c070'))); // the latch
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
    this._add(boxAt(x1 - 1.1, f, 76.2, x1, f + 1.4, 77.8, mat(STONE)));
    this._add(boxAt(x1 - 0.8, f + 1.4, 76.4, x1, top + 0.1, 77.6, mat(STONE))); // breast up to the ceiling
    this._add(boxAt(x1, gy - 0.3, 76.3, x1 + 0.9, CABIN.ridgeY + 1.0, 77.7, mat(STONE)));
    const fire = boxAt(x1 - 1.05, f + 0.05, 76.6, x1 - 0.55, f + 0.55, 77.4, new MeshBasicMaterial({ color: 0xff9a4a }));
    fire.castShadow = false;
    fire.layers.set(LAYER_GLOW);
    this.fire = this._add(fire);
    col.addBox(x1 - 1.15, 76.15, x1, 77.85, f - 0.1, top);
    col.addBox(x1, 76.3, x1 + 0.9, 77.7, wallY0, wallY1);

    // ── Table, chairs, lamp, rug ──────────────────────────────────────────
    // South of the doorway, so the way in is clear.
    const tx0 = 4.2, tx1 = 5.8, tz0 = 76.0, tz1 = 77.2;
    this._add(boxAt(tx0, f + 0.7, tz0, tx1, f + 0.78, tz1, mat(LOG)));
    for (const [lx, lz] of [[tx0 + 0.1, tz0 + 0.1], [tx1 - 0.1, tz0 + 0.1], [tx0 + 0.1, tz1 - 0.1], [tx1 - 0.1, tz1 - 0.1]]) {
      this._add(boxAt(lx - 0.05, f, lz - 0.05, lx + 0.05, f + 0.7, lz + 0.05, mat(DARK)));
    }
    col.addBox(tx0, tz0, tx1, tz1, f, f + 0.8);
    for (const cz of [tz0 - 0.55, tz1 + 0.55]) {
      this._add(boxAt(4.75, f + 0.42, cz - 0.22, 5.25, f + 0.48, cz + 0.22, mat(DARK)));
      this._add(boxAt(4.75, f, cz - 0.2, 5.25, f + 0.42, cz + 0.2, mat(DARK)));
      col.addCircle(5, cz, 0.28, f, f + 0.9);
    }
    this._add(boxAt(4.98, f + 2.2, 76.58, 5.02, top, 76.62, mat(DARK))); // the lamp's cord
    const bulb = boxAt(4.85, f + 2.05, 76.45, 5.15, f + 2.25, 76.75, new MeshBasicMaterial({ color: 0xffcf7a }));
    bulb.castShadow = false;
    this.bulb = this._add(bulb);
    const rug = new Mesh(new PlaneGeometry(3.2, 2.4), mat('#a85a4a'));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(5, f + 0.012, 76.6);
    rug.receiveShadow = true;
    this._add(rug);

    // ── Shelf and kitchen counter, under the loft ─────────────────────────
    this._add(boxAt(x0 + 0.1, f, 79.4, x0 + 0.5, f + 2.0, 81.6, mat(LOG)));
    for (const sy of [0.5, 1.1, 1.7]) this._add(boxAt(x0 + 0.1, f + sy, 79.4, x0 + 0.55, f + sy + 0.05, 81.6, mat(DARK)));
    col.addBox(x0, 79.4, x0 + 0.55, 81.6, f, f + 2);
    this._add(boxAt(6.0, f, z1 - 0.65, 10.4, f + 0.9, z1 - 0.1, mat(LOG)));
    this._add(boxAt(5.95, f + 0.9, z1 - 0.7, 10.45, f + 0.96, z1 - 0.1, mat(STONE)));
    col.addBox(6.0, z1 - 0.7, 10.45, z1, f, f + 1);

    // ── Loft, rail, ladder, bed ───────────────────────────────────────────
    const rz = CABIN.ridgeZ;
    const lad = CABIN.ladder;
    this._add(boxAt(x0, loftY - 0.16, rz, x1, loftY, z1, mat(FLOOR)));
    this._add(boxAt(x0 + 3.9, f, rz + 0.05, x0 + 4.1, loftY - 0.16, rz + 0.25, mat(DARK))); // a post under the loft edge
    col.addCircle(x0 + 4, rz + 0.15, 0.15, f, loftY);
    col.addSurface(x0, rz, x1, z1, loftY);
    const gap0 = lad.x - lad.w / 2;
    const gap1 = lad.x + lad.w / 2;
    for (const [a, b] of [[x0, gap0], [gap1, x1]]) {
      this._add(boxAt(a, loftY + 0.85, rz - 0.05, b, loftY + 0.95, rz + 0.05, mat(DARK)));
      for (let px = a + 0.05; px < b; px += 0.6) this._add(boxAt(px - 0.03, loftY, rz - 0.03, px + 0.03, loftY + 0.9, rz + 0.03, mat(DARK)));
      col.addSeg(a, rz, b, rz, loftY - 0.1, loftY + 1.2);
    }
    // Ladder: two rails and rungs, from the floor up over the loft edge.
    const lift = loftY - f;
    const runZ = lad.z1 - lad.z0;
    const ladAng = Math.atan2(lift + 0.9, runZ);
    const railLen = Math.hypot(lift + 0.9, runZ);
    for (const sx of [gap0 + 0.05, gap1 - 0.05]) {
      const rail = boxAt(-0.04, -railLen / 2, -0.04, 0.04, railLen / 2, 0.04, mat(DARK));
      rail.position.set(sx, f + (lift + 0.9) / 2, lad.z0 + runZ / 2);
      rail.rotation.x = Math.PI / 2 - ladAng;
      this._add(rail);
    }
    for (let k = 1; k <= 8; k++) {
      const t = k / 9;
      this._add(boxAt(gap0 + 0.05, f + t * (lift + 0.9) - 0.025, lad.z0 + t * runZ - 0.03, gap1 - 0.05, f + t * (lift + 0.9) + 0.025, lad.z0 + t * runZ + 0.03, mat(DARK)));
    }
    col.addSurface(gap0, lad.z0, gap1, lad.z1, (x, z) => f + clamp((z - lad.z0) / runZ, 0, 1) * lift);
    col.addSeg(gap0, lad.z0, gap0, lad.z1, f + 0.1, loftY + 1.2);
    col.addSeg(gap1, lad.z0, gap1, lad.z1, f + 0.1, loftY + 1.2);

    // The roof comes down over the back of the loft; keep heads out of it.
    col.addSeg(x0, 80.7, x1, 80.7, loftY - 0.1, loftY + 2);

    const bed = SPOTS.bed;
    this._add(boxAt(bed.x - 1.2, loftY, bed.z - 0.2, bed.x + 1.2, loftY + 0.3, bed.z + 1.0, mat(DARK)));
    this._add(boxAt(bed.x - 1.15, loftY + 0.3, bed.z - 0.15, bed.x + 1.15, loftY + 0.45, bed.z + 0.95, mat('#e8e0d0')));
    this._add(boxAt(bed.x - 1.15, loftY + 0.45, bed.z - 0.15, bed.x + 0.5, loftY + 0.52, bed.z + 0.95, mat('#6a86b8'))); // the blanket
    this._add(boxAt(bed.x + 0.6, loftY + 0.45, bed.z - 0.05, bed.x + 1.1, loftY + 0.6, bed.z + 0.85, mat('#f4efe4'))); // the pillow
    col.addBox(bed.x - 1.2, bed.z - 0.2, bed.x + 1.2, bed.z + 1.0, loftY, loftY + 0.6);

    // ── The bench on the porch (Zen sits here, in P3) ─────────────────────
    const b = SPOTS.bench;
    this._add(boxAt(b.x - 0.9, f + 0.42, b.z - 0.22, b.x + 0.9, f + 0.48, b.z + 0.22, mat(LOG)));
    for (const lx of [b.x - 0.75, b.x + 0.75]) this._add(boxAt(lx - 0.05, f, b.z - 0.2, lx + 0.05, f + 0.42, b.z + 0.2, mat(DARK)));
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
