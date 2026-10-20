/* ============================================================================
   props.js — everything outside that was built rather than grown.

   The dock, the bridge over the stream, the fire lookout in the forest, the
   mailbox, the telescope on the hill, the flat rock beside it, and the pile of
   skipping stones on the shore. Blocks, like the cabin; each one tells the
   collision what can be walked on and what cannot be walked through.
   ========================================================================== */

import { CylinderGeometry, DodecahedronGeometry, Group, Mesh, ConeGeometry } from 'three';
import { BRIDGE, DOCK, SPOTS, TOWER, heightAt } from './layout.js';
import { boxAt, mat } from './build.js';
import { rng } from '../core/util.js';

const LOG = 'wood:#9a6a44';
const DARK = 'wood:#5e4030';
const STONE = 'stone:#8d8d96';
const ROOF = 'roof:#7a4a3a';

function rock(r, hex, seed) {
  const g = new DodecahedronGeometry(r, 0);
  const rand = rng(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + rand() * 0.4), p.getY(i) * 0.55, p.getZ(i) * (0.8 + rand() * 0.4));
  g.computeVertexNormals();
  const m = new Mesh(g, mat(`stone:${hex}`));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function buildProps(col) {
  const group = new Group();
  const add = (m) => (group.add(m), m);

  // ── Dock ────────────────────────────────────────────────────────────────
  {
    const { x, z0, z1, w, y } = DOCK;
    add(boxAt(x - w / 2, y - 0.12, z1, x + w / 2, y, z0, mat(LOG), 0.8));
    for (let z = z1 + 0.3; z <= z0; z += 3) {
      for (const sx of [-1, 1]) {
        add(boxAt(x + sx * (w / 2 - 0.1) - 0.1, -2.5, z - 0.1, x + sx * (w / 2 - 0.1) + 0.1, y + 0.25, z + 0.1, mat(DARK)));
      }
    }
    col.addSurface(x - w / 2, z1, x + w / 2, z0, y);
  }

  // ── Bridge: a flat deck turned to follow the path, with rails ────────────
  {
    const { x, z, len, w, yaw } = BRIDGE;
    const ax = Math.sin(yaw);
    const az = Math.cos(yaw); // along the deck
    const ends = [heightAt(x - ax * len / 2, z - az * len / 2), heightAt(x + ax * len / 2, z + az * len / 2)];
    const y = Math.max(...ends) + 0.1; // low enough to step onto from either bank
    const b = new Group();
    b.position.set(x, 0, z);
    b.rotation.y = yaw;
    b.add(boxAt(-w / 2, y - 0.15, -len / 2, w / 2, y, len / 2, mat(LOG), 0.8));
    for (const sx of [-1, 1]) {
      b.add(boxAt(sx * w / 2 - 0.06, y + 0.85, -len / 2, sx * w / 2 + 0.06, y + 0.95, len / 2, mat(DARK)));
      for (const pz of [-len / 2, 0, len / 2]) b.add(boxAt(sx * w / 2 - 0.07, y - 0.6, pz - 0.07, sx * w / 2 + 0.07, y + 0.9, pz + 0.07, mat(DARK)));
    }
    add(b);
    // The surface is a turned rectangle: test it in the deck's own frame.
    const local = (px, pz) => {
      const dx = px - x;
      const dz = pz - z;
      return [dx * Math.cos(yaw) - dz * Math.sin(yaw), dx * Math.sin(yaw) + dz * Math.cos(yaw)];
    };
    const r = Math.hypot(len, w) / 2;
    col.addSurface(x - r, z - r, x + r, z + r, (px, pz) => {
      const [u, v] = local(px, pz);
      return Math.abs(u) <= w / 2 && Math.abs(v) <= len / 2 + 0.6 ? y : -Infinity;
    });
    for (const sx of [-1, 1]) {
      const cx = x + Math.cos(yaw) * sx * w / 2;
      const cz = z - Math.sin(yaw) * sx * w / 2;
      col.addSeg(cx - ax * len / 2, cz - az * len / 2, cx + ax * len / 2, cz + az * len / 2, y, y + 1.2);
    }
  }

  // ── The fire lookout: a long stair up to a deck above the trees ──────────
  {
    const { x, z, size, deck, stairRun } = TOWER;
    const gy = heightAt(x, z);
    const dy = gy + deck;
    const h = size / 2;
    for (const [lx, lz] of [[-h, -h], [h, -h], [-h, h], [h, h]]) {
      add(boxAt(x + lx - 0.15, gy - 0.5, z + lz - 0.15, x + lx + 0.15, dy + 2.6, z + lz + 0.15, mat(DARK)));
      col.addCircle(x + lx, z + lz, 0.2, gy - 1, dy + 3);
    }
    add(boxAt(x - h - 0.2, dy - 0.2, z - h - 0.2, x + h + 0.2, dy, z + h + 0.2, mat(LOG), 0.8));
    col.addSurface(x - h - 0.2, z - h - 0.2, x + h + 0.2, z + h + 0.2, dy);
    // Railing on three sides; the south side is open to the stair.
    const rail = (ax, az, bx, bz) => {
      add(boxAt(Math.min(ax, bx) - 0.05, dy + 0.95, Math.min(az, bz) - 0.05, Math.max(ax, bx) + 0.05, dy + 1.05, Math.max(az, bz) + 0.05, mat(DARK)));
      col.addSeg(ax, az, bx, bz, dy - 0.1, dy + 1.4);
    };
    rail(x - h, z - h, x + h, z - h);
    rail(x - h, z - h, x - h, z + h);
    rail(x + h, z - h, x + h, z + h);
    rail(x - h, z + h, x - 0.6, z + h);
    rail(x + 0.6, z + h, x + h, z + h);
    // A little pyramid roof, for the rain that P5 will bring.
    const cap = new Mesh(new ConeGeometry(h * 1.6, 1.6, 4), mat(ROOF));
    cap.position.set(x, dy + 3.4, z);
    cap.rotation.y = Math.PI / 4;
    cap.castShadow = true;
    add(cap);

    // The stair: one flight down the south side.
    // From the deck down to wherever the ground actually is at the foot, so the
    // first step is a step and not a ledge you walk underneath.
    const z0 = z + h;
    const z1 = z0 + stairRun;
    const foot = heightAt(x, z1);
    const rise = dy - foot;
    const stairY = (pz) => dy - ((pz - z0) / stairRun) * rise;
    const steps = Math.round(rise / 0.3);
    for (let i = 0; i < steps; i++) {
      const pz = z0 + (i + 0.5) * (stairRun / steps);
      add(boxAt(x - 0.6, stairY(pz) - 0.08, pz - stairRun / steps / 2, x + 0.6, stairY(pz), pz + stairRun / steps / 2, mat(LOG), 0.8));
    }
    for (const sx of [-0.62, 0.62]) {
      const len = Math.hypot(stairRun, rise);
      const stringer = boxAt(-0.05, -0.12, -len / 2, 0.05, 0.12, len / 2, mat(DARK));
      stringer.position.set(x + sx, foot + rise / 2, (z0 + z1) / 2);
      stringer.rotation.x = Math.atan2(rise, stairRun);
      add(stringer);
      col.addSeg(x + sx, z0, x + sx, z1, gy - 1, dy + 1.2);
    }
    col.addSurface(x - 0.6, z0, x + 0.6, z1, (px, pz) => Math.max(heightAt(px, pz), stairY(pz)));
  }

  // ── Mailbox ─────────────────────────────────────────────────────────────
  {
    const { x, z } = SPOTS.mailbox;
    const gy = heightAt(x, z);
    add(boxAt(x - 0.06, gy, z - 0.06, x + 0.06, gy + 1.05, z + 0.06, mat(DARK)));
    add(boxAt(x - 0.22, gy + 1.05, z - 0.3, x + 0.22, gy + 1.38, z + 0.3, mat('#b8504a')));
    add(boxAt(x + 0.22, gy + 1.2, z + 0.12, x + 0.26, gy + 1.5, z + 0.16, mat('#e8c060'))); // the flag
    col.addCircle(x, z, 0.32);
  }

  // ── Telescope and flat rock, on the hilltop ──────────────────────────────
  {
    const { x, z } = SPOTS.telescope;
    const gy = heightAt(x, z);
    const tripod = new Group();
    tripod.position.set(x, gy, z);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = new Mesh(new CylinderGeometry(0.03, 0.03, 1.4, 4), mat(DARK));
      leg.position.set(Math.sin(a) * 0.3, 0.65, Math.cos(a) * 0.3);
      leg.rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
      leg.castShadow = true;
      tripod.add(leg);
    }
    const tube = new Mesh(new CylinderGeometry(0.09, 0.12, 1.1, 6), mat('#c8b070'));
    tube.position.set(0, 1.4, 0);
    tube.rotation.set(-0.9, 0.6, 0);
    tube.castShadow = true;
    tripod.add(tube);
    add(tripod);
    col.addCircle(x, z, 0.45);

    const r = rock(1.6, '#9a9aa4', 77);
    const f = SPOTS.flatRock;
    const fy = heightAt(f.x, f.z);
    r.position.set(f.x, fy + 0.1, f.z);
    add(r);
    col.addSurface(f.x - 1.1, f.z - 1.1, f.x + 1.1, f.z + 1.1, fy + 0.45);
  }

  // ── Skipping stones on the shore ─────────────────────────────────────────
  {
    const { x, z } = SPOTS.stones;
    const rand = rng(31);
    for (let i = 0; i < 9; i++) {
      const s = rock(0.12 + rand() * 0.1, '#a8a8b0', 100 + i);
      const sx = x + (rand() - 0.5) * 1.4;
      const sz = z + (rand() - 0.5) * 1.4;
      s.position.set(sx, heightAt(sx, sz) + 0.03, sz);
      s.rotation.y = rand() * 6;
      add(s);
    }
  }

  // A few boulders around the world, so the meadow has something to walk round.
  {
    const rand = rng(909);
    for (const [bx, bz, br] of [[48, 40, 1.4], [-6, 30, 1.1], [60, -48, 1.8], [-78, 18, 1.5], [96, 30, 1.2], [8, -12, 0.9]]) {
      const b = rock(br, '#8d8d96', Math.floor(rand() * 1000));
      b.position.set(bx, heightAt(bx, bz) + br * 0.15, bz);
      add(b);
      col.addCircle(bx, bz, br * 0.85, -Infinity, heightAt(bx, bz) + br * 0.7);
    }
  }

  return group;
}
