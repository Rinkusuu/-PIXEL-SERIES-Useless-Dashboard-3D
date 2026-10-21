/* ============================================================================
   props.js — everything outside that was built rather than grown.

   The dock, the bridge over the stream, the fire lookout in the forest, the
   mailbox, the telescope on the hill, the flat rock beside it, the pile of
   skipping stones on the shore, boulders, and the lamp posts along the paths.
   Voxels, like the cabin; each one tells the collision what can be walked on
   and what cannot be walked through.
   ========================================================================== */

import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { BRIDGE, DOCK, LAMPS, SPOTS, TOWER, blockHeight } from './layout.js';
import { VoxelGrid, bake, grain, planks, courses, voxelMesh } from './voxel.js';
import { LAMP_GLASS, lampPost, rock } from './models.js';
import { LAYER_GLOW } from './renderer.js';
import { rng } from '../core/util.js';

const DARK = grain('#5e4030', 0.4);
const ROOF = courses('#7a4a3a', 2);

export function buildProps(col) {
  const group = new Group();
  const add = (m) => (group.add(m), m);
  // Decor nobody looks at by name — the dock, the bridge, the tower, the boulders,
  // the lamp posts — is baked into one mesh at the end: one draw instead of twenty-odd, per pass.
  const decor = [];
  const bakeLater = (m) => (decor.push(m), m);
  const glass = [];
  const named = {}; // things the dashboard objects reuse (objects.js)

  // ── Dock ────────────────────────────────────────────────────────────────
  {
    const { x, z0, z1, w, y } = DOCK;
    const g = new VoxelGrid([x - w / 2 - 0.2, -2.6, z1 - 0.2], [x + w / 2 + 0.2, y + 0.4, z0 + 0.2]);
    g.fillBox(x - w / 2, y - 0.1, z1, x + w / 2, y, z0, planks('#9a6a44', 2, 2));
    for (let z = z1 + 0.3; z <= z0; z += 3) {
      for (const sx of [-1, 1]) {
        const px = x + sx * (w / 2 - 0.1);
        g.fillBox(px - 0.1, -2.5, z - 0.1, px + 0.1, y + 0.3, z + 0.1, DARK);
      }
    }
    bakeLater(voxelMesh(g));
    col.addSurface(x - w / 2, z1, x + w / 2, z0, y);
  }

  // ── Bridge: built flat in its own frame, then turned to follow the path ──
  {
    const { x, z, len, w, yaw } = BRIDGE;
    const ax = Math.sin(yaw);
    const az = Math.cos(yaw); // along the deck
    const ends = [blockHeight(x - (ax * len) / 2, z - (az * len) / 2), blockHeight(x + (ax * len) / 2, z + (az * len) / 2)];
    const y = Math.max(...ends) + 0.1; // low enough to step onto from either bank
    const g = new VoxelGrid([-w / 2 - 0.2, y - 0.8, -len / 2 - 0.1], [w / 2 + 0.2, y + 1.1, len / 2 + 0.1]);
    g.fillBox(-w / 2, y - 0.1, -len / 2, w / 2, y, len / 2, planks('#9a6a44', 0, 2));
    for (const sx of [-1, 1]) {
      g.fillBox(sx * w / 2 - 0.1, y + 0.8, -len / 2, sx * w / 2 + 0.1, y + 0.9, len / 2, DARK);
      for (const pz of [-len / 2, 0, len / 2 - 0.2]) g.fillBox(sx * w / 2 - 0.1, y - 0.6, pz, sx * w / 2 + 0.1, y + 0.9, pz + 0.2, DARK);
    }
    const m = voxelMesh(g);
    m.position.set(x, 0, z);
    m.rotation.y = yaw;
    bakeLater(m);
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
      col.addSeg(cx - (ax * len) / 2, cz - (az * len) / 2, cx + (ax * len) / 2, cz + (az * len) / 2, y, y + 1.2);
    }
  }

  // ── The fire lookout: a long stair up to a deck above the trees ──────────
  {
    const { x, z, size, deck, stairRun } = TOWER;
    const gy = blockHeight(x, z);
    const dy = gy + deck;
    const h = size / 2;
    const z0 = z + h;
    const z1 = z0 + stairRun;
    const foot = blockHeight(x, z1);
    const rise = dy - foot;
    const stairY = (pz) => dy - ((pz - z0) / stairRun) * rise;

    const g = new VoxelGrid([x - h - 2.4, Math.min(gy, foot) - 0.6, z - h - 2.4], [x + h + 2.4, dy + 4.4, z1 + 0.2]);
    for (const [lx, lz] of [[-h, -h], [h, -h], [-h, h], [h, h]]) {
      g.fillBox(x + lx - 0.15, gy - 0.5, z + lz - 0.15, x + lx + 0.15, dy + 2.6, z + lz + 0.15, DARK);
      col.addCircle(x + lx, z + lz, 0.2, gy - 1, dy + 3);
    }
    g.fillBox(x - h - 0.2, dy - 0.2, z - h - 0.2, x + h + 0.2, dy, z + h + 0.2, planks('#9a6a44', 0, 2));
    col.addSurface(x - h - 0.2, z - h - 0.2, x + h + 0.2, z + h + 0.2, dy);
    // Railing on three sides; the south side is open to the stair.
    const rail = (ax, az, bx, bz) => {
      g.fillBox(Math.min(ax, bx) - 0.05, dy + 0.9, Math.min(az, bz) - 0.05, Math.max(ax, bx) + 0.05, dy + 1.05, Math.max(az, bz) + 0.05, DARK);
      col.addSeg(ax, az, bx, bz, dy - 0.1, dy + 1.4);
    };
    rail(x - h, z - h, x + h, z - h);
    rail(x - h, z - h, x - h, z + h);
    rail(x + h, z - h, x + h, z + h);
    rail(x - h, z + h, x - 0.6, z + h);
    rail(x + 0.6, z + h, x + h, z + h);
    // A stepped pyramid roof.
    g.fill([x - h * 1.6, dy + 2.6, z - h * 1.6], [x + h * 1.6, dy + 4.3, z + h * 1.6], (px, py, pz) => {
      const k = 1 - (py - (dy + 2.6)) / 1.7;
      return Math.max(Math.abs(px - x), Math.abs(pz - z)) < h * 1.6 * k;
    }, ROOF);
    // The stair: a flight of treads down the south side, with stringers.
    const steps = Math.round(rise / 0.3);
    for (let i = 0; i < steps; i++) {
      const pz = z0 + (i + 0.5) * (stairRun / steps);
      g.fillBox(x - 0.6, stairY(pz) - 0.1, pz - stairRun / steps / 2, x + 0.6, stairY(pz), pz + stairRun / steps / 2, planks('#9a6a44', 0, 2));
    }
    for (const sx of [-0.65, 0.65]) {
      g.fill([x + sx - 0.05, foot - 0.3, z0], [x + sx + 0.05, dy + 1.1, z1], (px, py, pz) => Math.abs(py - stairY(pz) - 0.4) < 0.5, DARK);
      col.addSeg(x + sx, z0, x + sx, z1, gy - 1, dy + 1.2);
    }
    bakeLater(voxelMesh(g));
    col.addSurface(x - 0.6, z0, x + 0.6, z1, (px, pz) => Math.max(blockHeight(px, pz), stairY(pz)));
  }

  // ── Mailbox ─────────────────────────────────────────────────────────────
  {
    const { x, z } = SPOTS.mailbox;
    const gy = blockHeight(x, z);
    const g = new VoxelGrid([x - 0.4, gy, z - 0.4], [x + 0.4, gy + 1.6, z + 0.4]);
    g.fillBox(x - 0.05, gy, z - 0.05, x + 0.05, gy + 1.05, z + 0.05, DARK);
    g.fillBox(x - 0.2, gy + 1.05, z - 0.3, x + 0.2, gy + 1.4, z + 0.3, grain('#b8504a', 0.3));
    g.fillBox(x + 0.2, gy + 1.2, z + 0.1, x + 0.3, gy + 1.5, z + 0.2, grain('#e8c060', 0.2)); // the flag
    named.mailbox = add(voxelMesh(g));
    col.addCircle(x, z, 0.32);
  }

  // ── Telescope and flat rock, on the hilltop ──────────────────────────────
  {
    const { x, z } = SPOTS.telescope;
    const gy = blockHeight(x, z);
    const g = new VoxelGrid([x - 0.6, gy, z - 0.6], [x + 0.6, gy + 2, z + 0.6], 0.05);
    const iron = grain('#3a3a44', 0.3);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const fx = x + Math.sin(a) * 0.45;
      const fz = z + Math.cos(a) * 0.45;
      // A leg leaning in from its foot to the head at 1.3 m.
      g.fill([x - 0.5, gy, z - 0.5], [x + 0.5, gy + 1.3, z + 0.5], (px, py, pz) => {
        const t = (py - gy) / 1.3;
        return Math.hypot(px - (fx + (x - fx) * t), pz - (fz + (z - fz) * t)) < 0.04;
      }, iron);
    }
    // The tube, tilted toward the sky.
    g.fill([x - 0.6, gy + 1.2, z - 0.6], [x + 0.6, gy + 2, z + 0.6], (px, py, pz) => {
      const t = py - (gy + 1.3);
      return t > -0.1 && t < 0.6 && Math.hypot(px - (x + t * 0.5), pz - (z - t * 0.35)) < 0.09;
    }, grain('#c8b070', 0.3));
    named.telescope = add(voxelMesh(g));
    col.addCircle(x, z, 0.45);

    const f = SPOTS.flatRock;
    const fy = blockHeight(f.x, f.z);
    const r = voxelMesh(rock(1.6, 77));
    r.position.set(f.x, fy - 0.2, f.z);
    named.flatRock = add(r);
    // Lying back on the rock, looking west over the lake (positive yaw turns west).
    named.rockSeat = { x: f.x, z: f.z, y: fy + 0.45, yaw: Math.PI / 2, standZ: f.z };
    col.addSurface(f.x - 1.1, f.z - 1.1, f.x + 1.1, f.z + 1.1, fy + 0.45);
  }

  // ── Skipping stones on the shore: one pile, one mesh, one thing to pick from ──
  {
    const { x, z } = SPOTS.stones;
    const y = blockHeight(x, z);
    const rand = rng(31);
    const g = new VoxelGrid([x - 0.9, y, z - 0.9], [x + 0.9, y + 0.3, z + 0.9], 0.03);
    for (let i = 0; i < 11; i++) {
      const sx = x + (rand() - 0.5) * 1.3;
      const sz = z + (rand() - 0.5) * 1.3;
      const r = 0.1 + rand() * 0.08;
      g.fill([sx - r, y, sz - r], [sx + r, y + r, sz + r], (px, py, pz) => Math.hypot((px - sx) / r, (py - y) / (r * 0.45), (pz - sz) / r) < 1, grain(rand() < 0.5 ? '#a8a8b0' : '#8d8d96', 0.5));
    }
    named.stones = add(voxelMesh(g));
  }

  // A few boulders around the world, so the meadow has something to walk round.
  for (const [bx, bz, br, seed] of [[48, 40, 1.4, 1], [-6, 30, 1.1, 2], [60, -48, 1.8, 3], [-78, 18, 1.5, 4], [96, 30, 1.2, 5], [8, -12, 0.9, 6]]) {
    const b = voxelMesh(rock(br, seed * 97));
    const by = blockHeight(bx, bz);
    b.position.set(bx, by - 0.1, bz);
    bakeLater(b);
    col.addCircle(bx, bz, br * 0.85, -Infinity, by + br * 0.6);
  }

  // ── Lamp posts along the paths ───────────────────────────────────────────
  const postTpl = voxelMesh(lampPost());
  const glassMat = new MeshBasicMaterial({ color: 0xffcf7a });
  const glassGeo = new BoxGeometry(LAMP_GLASS.half * 2, LAMP_GLASS.y1 - LAMP_GLASS.y0, LAMP_GLASS.half * 2);
  for (const l of LAMPS) {
    const y = blockHeight(l.x, l.z);
    const post = postTpl.clone(); // shares geometry and material
    post.position.set(l.x, y, l.z);
    bakeLater(post);
    const g = new Mesh(glassGeo, glassMat);
    g.position.set(l.x, y + (LAMP_GLASS.y0 + LAMP_GLASS.y1) / 2, l.z);
    glass.push(g);
    col.addCircle(l.x, l.z, 0.15);
    l.y = y + LAMP_GLASS.y0 + 0.15; // where the light hangs
  }

  add(bake(decor));
  // All the lamp glass lights up together, so it is one mesh too.
  const lit = bake(glass);
  lit.material = glassMat;
  lit.castShadow = false;
  add(lit);

  return { group, lampGlass: [lit], lampMat: glassMat, named };
}

/** Lamps glow at night; by day the glass is just dull. */
export function updateLamps(props, dark) {
  props.lampMat.color.setRGB(0.25 + 0.75 * dark, 0.22 + 0.6 * dark, 0.18 + 0.3 * dark);
  for (const g of props.lampGlass) g.layers.set(dark > 0.3 ? LAYER_GLOW : 0);
}
