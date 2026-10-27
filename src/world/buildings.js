/* ============================================================================
   buildings.js — the places out in the world.

   A barn in the meadow (doors open on a hay loft and a workbench), a windmill
   on the rise whose sails turn with the real wind, a gazebo looking over the
   lake, a boathouse half on piles over the water with a boat inside, the
   ruins of something old in the forest, a signpost where the paths part,
   benches along the way, and a rowboat tied at the dock. Like the cabin: one
   voxel grid per building, all baked into one mesh, with collision for walls
   and floors you can walk on.
   ========================================================================== */

import { CanvasTexture, Group, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry } from 'three';
import { DOCK, HILL, PLACES, WATER_Y, blockHeight } from './layout.js';
import { VoxelGrid, bake, color, grain, voxelMesh } from './voxel.js';
import { pxText, textWidth } from '../ui/pixel.js';
import { rng } from '../core/util.js';

const WOOD = grain('#9a6a44', 0.4);
const DARK = grain('#5e4030', 0.4);
const RED = (i, j) => (j % 6 === 0 ? color('#6a2a24') : grain('#a8443a', 0.4)(i, j, 0)); // barn boards, in courses
const STONE = grain('#8d8d96', 0.8);
const MOSS = grain('#5a7a3a', 0.6);
const ROOF = grain('#5a4a44', 0.4);

function cluster(min, max, size, build) {
  const g = new VoxelGrid(min, max, size);
  build(g);
  return voxelMesh(g);
}

/** The highest ground under a footprint, so a building never floats or sinks a corner. */
function footprintTop(x0, z0, x1, z1) {
  let h = -Infinity;
  for (let x = x0; x <= x1; x += 0.5) for (let z = z0; z <= z1; z += 0.5) h = Math.max(h, blockHeight(x, z));
  return h;
}

/** A small hand-painted sign: the classic 3×5 font on a board, as a texture. */
function signFace(text, w, h) {
  const cv = document.createElement('canvas');
  cv.width = textWidth(text) + 4;
  cv.height = 9;
  const g = cv.getContext('2d');
  g.fillStyle = '#c8a878';
  g.fillRect(0, 0, cv.width, cv.height);
  pxText(g, 2, 2, text, '#3a2a20');
  const tex = new CanvasTexture(cv);
  tex.magFilter = tex.minFilter = NearestFilter;
  return new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: tex }));
}

export function buildBuildings(col) {
  const parts = [];
  const add = (m) => parts.push(m);
  const extra = new Group(); // things that are not baked: the turning sails, the bobbing boat, sign faces

  // ── The barn ──────────────────────────────────────────────────────────────
  {
    const B = PLACES.barn;
    const f = footprintTop(B.x0, B.z0, B.x1, B.z1) + 0.1;
    const wallTop = f + 3.2;
    const ridge = f + 5.4;
    const mid = (B.x0 + B.x1) / 2;
    const roofAt = (px) => wallTop + (ridge - wallTop) * (1 - Math.abs(px - mid) / ((B.x1 - B.x0) / 2 + 0.6));
    const door = { a: mid - 1.4, b: mid + 1.4, h: f + 2.8 }; // big doors in the north gable end
    add(cluster([B.x0 - 0.8, f - 1, B.z0 - 0.8], [B.x1 + 0.8, ridge + 0.4, B.z1 + 0.8], 0.1, (g) => {
      g.fillBox(B.x0, f - 1, B.z0, B.x1, f, B.z1, STONE); // foundation
      g.fillBox(B.x0 + 0.2, f - 0.1, B.z0 + 0.2, B.x1 - 0.2, f, B.z1 - 0.2, grain('#8a7050', 0.6)); // plank floor with straw
      // Walls (with the gable end rising to the ridge), then carve the doorway and two small windows.
      g.fill([B.x0, f, B.z0], [B.x1, ridge, B.z1], (px, py, pz) => {
        const edge = px < B.x0 + 0.2 || px > B.x1 - 0.2 || pz < B.z0 + 0.2 || pz > B.z1 - 0.2;
        const gable = pz < B.z0 + 0.2 || pz > B.z1 - 0.2;
        return edge && (py < wallTop || (gable && py < roofAt(px)));
      }, RED);
      g.fillBox(door.a, f, B.z0 - 0.1, door.b, door.h, B.z0 + 0.3, 0);
      for (const z of [B.z0 + 3, B.z1 - 2.5]) for (const x of [B.x0, B.x1 - 0.2]) g.fillBox(x - 0.05, f + 1.6, z, x + 0.25, f + 2.4, z + 0.8, 0);
      // White trim round the door, and the doors themselves standing open.
      g.fill([door.a - 0.2, f, B.z0 - 0.15], [door.b + 0.2, door.h + 0.2, B.z0 + 0.05], (px, py) => px < door.a || px > door.b || py > door.h, color('#e8e0d0'));
      for (const [x0, x1] of [[door.a - 1.4, door.a - 0.05], [door.b + 0.05, door.b + 1.4]]) {
        g.fillBox(x0, f, B.z0 - 0.3, x1, door.h - 0.05, B.z0 - 0.2, RED);
        g.fill([x0, f, B.z0 - 0.35], [x1, door.h, B.z0 - 0.3], (px, py) => Math.abs((py - f) - (px - x0) * ((door.h - f) / (x1 - x0))) < 0.08 || Math.abs((py - f) - (x1 - px) * ((door.h - f) / (x1 - x0))) < 0.08, color('#e8e0d0')); // the X brace
      }
      // The roof: two slopes with an overhang.
      g.fill([B.x0 - 0.7, wallTop - 0.4, B.z0 - 0.5], [B.x1 + 0.7, ridge + 0.3, B.z1 + 0.5], (px, py) => Math.abs(py - roofAt(px) - 0.1) < 0.12, ROOF);
      // Inside: a hay loft over the back half, hay bales, a workbench with tools.
      g.fillBox(B.x0 + 0.2, f + 2.3, B.z0 + 5, B.x1 - 0.2, f + 2.4, B.z1 - 0.2, WOOD);
      const hay = grain('#d8b860', 0.6);
      for (const [x, z, y] of [[B.x0 + 0.4, B.z1 - 1.3, f + 2.4], [B.x0 + 1.6, B.z1 - 1.3, f + 2.4], [B.x0 + 1.0, B.z1 - 1.3, f + 2.9], [B.x1 - 1.5, B.z1 - 1.4, f], [B.x1 - 1.5, B.z1 - 2.5, f], [B.x1 - 1.5, B.z1 - 1.9, f + 0.5]]) {
        g.fillBox(x, y, z, x + 1.1, y + 0.5, z + 0.9, hay);
      }
      g.fillBox(B.x0 + 0.3, f + 0.85, B.z0 + 1.0, B.x0 + 1.0, f + 0.95, B.z0 + 3.4, WOOD); // workbench
      for (const z of [B.z0 + 1.1, B.z0 + 3.2]) g.fillBox(B.x0 + 0.35, f, z, B.x0 + 0.45, f + 0.85, z + 0.1, DARK);
      g.fillBox(B.x0 + 0.2, f + 1.4, B.z0 + 1.0, B.x0 + 0.25, f + 2.2, B.z0 + 3.4, DARK); // tool board
      for (const [z, len] of [[B.z0 + 1.3, 0.6], [B.z0 + 1.8, 0.5], [B.z0 + 2.4, 0.7], [B.z0 + 3.0, 0.4]]) g.fillBox(B.x0 + 0.25, f + 2.1 - len, z, B.x0 + 0.3, f + 2.1, z + 0.1, color('#7a7a82'));
    }));
    const wy0 = f - 1;
    col.addSurface(B.x0, B.z0, B.x1, B.z1, f);
    col.addSeg(B.x0, B.z0, door.a, B.z0, wy0, ridge);
    col.addSeg(door.b, B.z0, B.x1, B.z0, wy0, ridge);
    col.addSeg(B.x1, B.z0, B.x1, B.z1, wy0, ridge);
    col.addSeg(B.x1, B.z1, B.x0, B.z1, wy0, ridge);
    col.addSeg(B.x0, B.z1, B.x0, B.z0, wy0, ridge);
    col.addBox(B.x1 - 1.5, B.z1 - 2.5, B.x1 - 0.4, B.z1 - 0.4, f, f + 1);
    col.addBox(B.x0 + 0.3, B.z0 + 1.0, B.x0 + 1.0, B.z0 + 3.4, f, f + 1);
  }

  // ── The windmill: a stone tower, a cap, sails that turn with the wind ──
  const M = PLACES.windmill;
  const my = blockHeight(M.x, M.z);
  add(cluster([M.x - 2.6, my - 0.5, M.z - 2.6], [M.x + 2.6, my + 9.6, M.z + 2.6], 0.1, (g) => {
    g.fill([M.x - 2.6, my - 0.5, M.z - 2.6], [M.x + 2.6, my + 8, M.z + 2.6], (px, py, pz) => {
      const rad = 2.3 - (py - my) * 0.12; // a tower that narrows as it rises
      const d = Math.hypot(px - M.x, pz - M.z);
      return d < rad && d > rad - 0.3;
    }, (i, j, k) => (j % 5 === 0 ? color('#b8b0a0') : grain('#d8d0c0', 0.5)(i, j, k)));
    g.fillBox(M.x - 0.5, my, M.z - 2.4, M.x + 0.5, my + 2, M.z - 1.5, 0); // the door, north
    g.fillBox(M.x - 0.55, my, M.z - 2.3, M.x + 0.55, my + 2.1, M.z - 2.2, DARK);
    for (const y of [3, 5.5]) g.fillBox(M.x + 1.4, my + y, M.z - 0.3, M.x + 2.4, my + y + 0.7, M.z + 0.3, 0); // windows
    // The cap: a little pointed roof.
    g.fill([M.x - 1.8, my + 7.8, M.z - 1.8], [M.x + 1.8, my + 9.6, M.z + 1.8], (px, py, pz) => Math.hypot(px - M.x, pz - M.z) < 1.7 * (1 - (py - my - 7.8) / 1.8), ROOF);
  }));
  col.addCircle(M.x, M.z, 2.3);
  const sails = new Group();
  const hub = new VoxelGrid([-4.5, -4.5, -0.15], [4.5, 4.5, 0.15], 0.1);
  hub.fillBox(-0.3, -0.3, -0.15, 0.3, 0.3, 0.15, DARK);
  for (let a = 0; a < 4; a++) {
    const c = Math.cos((a * Math.PI) / 2);
    const s = Math.sin((a * Math.PI) / 2);
    hub.fill([-4.5, -4.5, -0.1], [4.5, 4.5, 0.1], (px, py) => {
      const along = px * c + py * s;
      const across = -px * s + py * c;
      if (along < 0.3 || along > 4.4) return false;
      if (Math.abs(across) < 0.08) return true; // the stock
      return across > 0.12 && across < 0.9 && (Math.floor(along / 0.4) % 1 === 0) && (Math.abs(across - 0.12) < 0.06 || Math.abs(across - 0.9) < 0.06 || Math.abs((along * 2.5) % 1) < 0.15); // a lattice frame
    }, (i, j) => grain('#e8e0d0', 0.3)(i, j, 0));
  }
  const sailMesh = voxelMesh(hub);
  sails.add(sailMesh);
  sails.position.set(M.x, my + 7.3, M.z - 2.1);
  extra.add(sails);

  // ── The gazebo: eight posts, a rail, a pointed roof, a bench inside ──
  const Z = PLACES.gazebo;
  const zy = footprintTop(Z.x - 2.4, Z.z - 2.4, Z.x + 2.4, Z.z + 2.4) + 0.25;
  add(cluster([Z.x - 3, zy - 1, Z.z - 3], [Z.x + 3, zy + 4.4, Z.z + 3], 0.1, (g) => {
    g.fill([Z.x - 2.6, zy - 1, Z.z - 2.6], [Z.x + 2.6, zy, Z.z + 2.6], (px, py, pz) => Math.max(Math.abs(px - Z.x), Math.abs(pz - Z.z)) * 0.9 + Math.min(Math.abs(px - Z.x), Math.abs(pz - Z.z)) * 0.42 < 2.4, (i, j, k) => (j === 9 ? WOOD(i, j, k) : STONE(i, j, k)));
    for (let a = 0; a < 8; a++) {
      const px = Z.x + Math.cos((a * Math.PI) / 4 + Math.PI / 8) * 2.2;
      const pz = Z.z + Math.sin((a * Math.PI) / 4 + Math.PI / 8) * 2.2;
      g.fillBox(px - 0.1, zy, pz - 0.1, px + 0.1, zy + 2.6, pz + 0.1, color('#e8e0d0'));
      if (a !== 6) { // the open side faces the lake (west-ish): a rail on the others
        const qx = Z.x + Math.cos(((a + 1) * Math.PI) / 4 + Math.PI / 8) * 2.2;
        const qz = Z.z + Math.sin(((a + 1) * Math.PI) / 4 + Math.PI / 8) * 2.2;
        g.fill([Math.min(px, qx) - 0.1, zy + 0.8, Math.min(pz, qz) - 0.1], [Math.max(px, qx) + 0.1, zy + 1.0, Math.max(pz, qz) + 0.1], (x, y, z) => {
          const t = ((x - px) * (qx - px) + (z - pz) * (qz - pz)) / ((qx - px) ** 2 + (qz - pz) ** 2);
          return t > 0 && t < 1 && Math.hypot(x - (px + (qx - px) * t), z - (pz + (qz - pz) * t)) < 0.07;
        }, color('#e8e0d0'));
      }
    }
    g.fill([Z.x - 3, zy + 2.6, Z.z - 3], [Z.x + 3, zy + 4.4, Z.z + 3], (px, py, pz) => {
      const d = Math.max(Math.abs(px - Z.x), Math.abs(pz - Z.z)) * 0.9 + Math.min(Math.abs(px - Z.x), Math.abs(pz - Z.z)) * 0.42;
      return Math.abs(d - 2.7 * (1 - (py - zy - 2.6) / 1.8)) < 0.15;
    }, grain('#5a7a8a', 0.3));
    g.fill([Z.x - 1.6, zy, Z.z - 0.3], [Z.x + 1.6, zy + 0.5, Z.z + 0.3], (px, py, pz) => py > zy + 0.4 || Math.abs(Math.abs(px - Z.x) - 1.3) < 0.08, WOOD); // a bench
  }));
  col.addSurface(Z.x - 2.5, Z.z - 2.5, Z.x + 2.5, Z.z + 2.5, (x, z) => (Math.hypot(x - Z.x, z - Z.z) < 2.4 ? zy : -Infinity));
  for (let a = 0; a < 8; a++) col.addCircle(Z.x + Math.cos((a * Math.PI) / 4 + Math.PI / 8) * 2.2, Z.z + Math.sin((a * Math.PI) / 4 + Math.PI / 8) * 2.2, 0.15);
  col.addBox(Z.x - 1.6, Z.z - 0.3, Z.x + 1.6, Z.z + 0.3, zy, zy + 0.5);

  // ── The boathouse: on piles over the water, open to the lake, a boat inside ──
  const H = PLACES.boathouse;
  const hf = Math.max(WATER_Y + 0.6, blockHeight(H.x1, (H.z0 + H.z1) / 2) + 0.1);
  const htop = hf + 2.6;
  const hmid = (H.z0 + H.z1) / 2;
  add(cluster([H.x0 - 0.6, WATER_Y - 2, H.z0 - 0.6], [H.x1 + 0.6, htop + 1.9, H.z1 + 0.6], 0.1, (g) => {
    for (let x = H.x0; x <= H.x1; x += 1.75) for (const z of [H.z0, H.z1 - 0.2]) g.fillBox(x, WATER_Y - 2, z, x + 0.2, hf, z + 0.2, DARK); // piles
    g.fillBox(H.x0, hf - 0.1, H.z0, H.x1, hf, H.z0 + 1.2, WOOD); // walkways along both sides…
    g.fillBox(H.x0, hf - 0.1, H.z1 - 1.2, H.x1, hf, H.z1, WOOD);
    g.fillBox(H.x1 - 2, hf - 0.1, H.z0, H.x1, hf, H.z1, WOOD); // …and across the land end; the middle is open water
    g.fill([H.x0, hf, H.z0], [H.x1, htop, H.z1], (px, py, pz) => (pz < H.z0 + 0.15 || pz > H.z1 - 0.15 || px > H.x1 - 0.15) && !(px > H.x1 - 0.2 && Math.abs(pz - hmid) < 0.5 && py < hf + 2.1), (i, j) => (j % 4 === 0 ? color('#6a4a30') : grain('#7a6a58', 0.4)(i, j, 0))); // weathered board walls, a door on the land side
    g.fill([H.x0 - 0.5, htop - 0.2, H.z0 - 0.5], [H.x1 + 0.5, htop + 1.9, H.z1 + 0.5], (px, py, pz) => Math.abs(py - (htop + 1.7 - Math.abs(pz - hmid) * 0.42)) < 0.1, ROOF);
    // Coils of rope, a lifebuoy, an oar on the wall.
    g.fill([H.x1 - 1.6, hf, H.z0 + 0.2], [H.x1 - 0.9, hf + 0.25, H.z0 + 0.9], (px, py, pz) => { const d = Math.hypot(px - (H.x1 - 1.25), pz - (H.z0 + 0.55)); return d < 0.3 && d > 0.12; }, color('#c8b080'));
    g.fill([H.x1 - 3.5, hf + 1.2, H.z1 - 0.25], [H.x1 - 2.7, hf + 2, H.z1 - 0.15], (px, py) => { const d = Math.hypot(px - (H.x1 - 3.1), py - hf - 1.6); return d < 0.38 && d > 0.22; }, (i) => color(i % 4 < 2 ? '#d0402a' : '#f4f0e8'));
    g.fillBox(H.x0 + 1, hf + 1.4, H.z0 + 0.15, H.x0 + 3.2, hf + 1.5, H.z0 + 0.25, WOOD);
  }));
  col.addSurface(H.x0, H.z0, H.x1, H.z0 + 1.2, hf);
  col.addSurface(H.x0, H.z1 - 1.2, H.x1, H.z1, hf);
  col.addSurface(H.x1 - 2, H.z0, H.x1, H.z1, hf);
  col.addSeg(H.x0, H.z0, H.x1, H.z0, WATER_Y - 2, htop);
  col.addSeg(H.x0, H.z1, H.x1, H.z1, WATER_Y - 2, htop);
  col.addSeg(H.x1, H.z0, H.x1, hmid - 0.5, WATER_Y - 2, htop);
  col.addSeg(H.x1, hmid + 0.5, H.x1, H.z1, WATER_Y - 2, htop);
  // The walkways' open edges onto the water slot: a low curb, so nobody steps into it.
  col.addSeg(H.x0, H.z0 + 1.2, H.x1 - 2, H.z0 + 1.2, hf - 0.2, hf + 0.6);
  col.addSeg(H.x0, H.z1 - 1.2, H.x1 - 2, H.z1 - 1.2, hf - 0.2, hf + 0.6);
  col.addSeg(H.x1 - 2, H.z0 + 1.2, H.x1 - 2, H.z1 - 1.2, hf - 0.2, hf + 0.6);

  // ── Boats: one in the boathouse, one tied at the dock ──
  const boat = () => {
    const g = new VoxelGrid([-1.8, 0, -0.65], [1.8, 0.6, 0.65], 0.05);
    g.fill([-1.8, 0, -0.65], [1.8, 0.6, 0.65], (px, py, pz) => {
      const half = 0.6 * Math.sqrt(Math.max(0, 1 - (px / 1.8) ** 2)); // pointed at both ends
      const w = half * (0.55 + 0.45 * (py / 0.55));
      const inHull = Math.abs(pz) < w && py < 0.55;
      const shell = inHull && (Math.abs(pz) > w - 0.06 || py < 0.06);
      return shell;
    }, (i, j) => (j >= 9 ? color('#e8e0d0') : grain('#5a7aa0', 0.3)(i, j, 0)));
    g.fillBox(-0.15, 0.25, -0.5, 0.15, 0.3, 0.5, WOOD); // a thwart
    g.fillBox(0.9, 0.2, -0.4, 1.1, 0.25, 0.4, WOOD);
    return voxelMesh(g);
  };
  const b1 = boat();
  b1.position.set((H.x0 + H.x1 - 2) / 2, WATER_Y - 0.08, hmid);
  const b2 = boat();
  b2.position.set(PLACES.boat.x, WATER_Y - 0.08, PLACES.boat.z);
  b2.rotation.y = Math.PI / 2;
  extra.add(b1, b2);
  add(cluster([DOCK.x + DOCK.w / 2 - 0.4, DOCK.y, PLACES.boat.z - 0.4], [DOCK.x + DOCK.w / 2 + 0.6, DOCK.y + 0.5, PLACES.boat.z + 0.4], 0.025, (g) => {
    // The mooring: a cleat on the dock and a rope down to the boat.
    const cx = DOCK.x + DOCK.w / 2 - 0.2;
    g.fillBox(cx - 0.1, DOCK.y, PLACES.boat.z - 0.025, cx + 0.1, DOCK.y + 0.06, PLACES.boat.z + 0.025, color('#3a3a44'));
    g.fill([cx, DOCK.y - 0.1, PLACES.boat.z - 0.03], [cx + 0.6, DOCK.y + 0.1, PLACES.boat.z + 0.03], (px, py) => Math.abs(py - (DOCK.y + 0.05 - (px - cx) * 0.6 + Math.sin((px - cx) * 5) * 0.03)) < 0.02, color('#c8b080'));
  }));

  // ── The ruins in the forest: broken walls, an arch, fallen columns, moss ──
  const R = PLACES.ruins;
  const ry = blockHeight(R.x, R.z);
  const rr = rng(2121);
  add(cluster([R.x - 7.5, ry - 0.5, R.z - 7.5], [R.x + 7.5, ry + 5, R.z + 7.5], 0.2, (g) => {
    const wallH = (px, pz) => 0.6 + 3.2 * Math.abs(Math.sin(px * 0.7 + pz * 0.3)) * (0.6 + 0.4 * Math.sin(pz * 1.3)); // broken to uneven heights
    g.fill([R.x - 6, ry - 0.5, R.z - 6], [R.x + 6, ry + 4.5, R.z + 6], (px, py, pz) => {
      const dx = Math.abs(px - R.x);
      const dz = Math.abs(pz - R.z);
      const onWall = (Math.abs(dx - 5) < 0.3 && dz < 5.3) || (Math.abs(dz - 5) < 0.3 && dx < 5.3);
      const gap = Math.abs(pz - (R.z + 5)) < 0.4 && dx < 1.3; // the way in, south
      return onWall && !gap && py < ry + wallH(px, pz);
    }, (i, j, k) => (rr() < 0.25 ? MOSS(i, j, k) : STONE(i, j, k)));
    // An arch still standing over the way in.
    g.fill([R.x - 1.8, ry, R.z + 4.6], [R.x + 1.8, ry + 4.2, R.z + 5.4], (px, py) => {
      const d = Math.hypot(px - R.x, Math.max(0, py - ry - 2.2));
      return (Math.abs(px - R.x) > 1.2 || py > ry + 2.2) && d < 1.8 && !(d < 1.2 && py > ry + 2.2) && !(Math.abs(px - R.x) < 1.2 && py < ry + 2.2);
    }, STONE);
    // Two columns, one still up, one fallen; slabs in the grass; a block with a carving.
    g.fill([R.x - 2.4, ry, R.z - 2.4], [R.x - 1.6, ry + 3.4, R.z - 1.6], (px, py, pz) => Math.hypot(px - R.x + 2, pz - R.z + 2) < 0.35, (i, j, k) => (j % 6 === 0 ? color('#a0a0a8') : STONE(i, j, k)));
    g.fill([R.x + 0.5, ry, R.z - 2.4], [R.x + 3.8, ry + 0.8, R.z - 1.6], (px, py, pz) => Math.hypot(py - ry - 0.35, pz - R.z + 2) < 0.35, (i, j, k) => (rr() < 0.4 ? MOSS(i, j, k) : STONE(i, j, k)));
    for (let k = 0; k < 7; k++) {
      const sx = R.x - 3.5 + rr() * 7;
      const sz = R.z - 3.5 + rr() * 6;
      g.fillBox(sx, ry - 0.1, sz, sx + 0.8, ry + 0.1, sz + 0.6, (i, j, kk) => (rr() < 0.3 ? MOSS(i, j, kk) : STONE(i, j, kk)));
    }
    g.fillBox(R.x + 1.5, ry, R.z + 1.0, R.x + 2.5, ry + 1.0, R.z + 1.8, (i, j) => (j === 3 && i % 2 === 0 ? color('#5a5a62') : STONE(i, j, 0)));
  }));
  // Walls block; the way in is open.
  col.addSeg(R.x - 5, R.z - 5, R.x + 5, R.z - 5, -Infinity, ry + 1.5);
  col.addSeg(R.x - 5, R.z - 5, R.x - 5, R.z + 5, -Infinity, ry + 1.5);
  col.addSeg(R.x + 5, R.z - 5, R.x + 5, R.z + 5, -Infinity, ry + 1.5);
  col.addSeg(R.x - 5, R.z + 5, R.x - 1.4, R.z + 5, -Infinity, ry + 1.5);
  col.addSeg(R.x + 1.4, R.z + 5, R.x + 5, R.z + 5, -Infinity, ry + 1.5);
  col.addCircle(R.x - 2, R.z - 2, 0.4);
  col.addBox(R.x + 0.5, R.z - 2.4, R.x + 3.8, R.z - 1.6, ry, ry + 0.7);
  col.addBox(R.x + 1.5, R.z + 1.0, R.x + 2.5, R.z + 1.8, ry, ry + 1.0);

  // ── The signpost where the paths part ──
  const S = PLACES.signpost;
  const sy = blockHeight(S.x, S.z);
  add(cluster([S.x - 1.2, sy, S.z - 0.6], [S.x + 1.2, sy + 2.4, S.z + 0.6], 0.05, (g) => {
    g.fillBox(S.x - 0.06, sy, S.z - 0.06, S.x + 0.06, sy + 2.3, S.z + 0.06, DARK);
  }));
  col.addCircle(S.x, S.z, 0.15);
  // Three arrows, each a board with the place's name, turned to point at it.
  for (const [label, tx, tz, h] of [['DOCK', -40, 18, 2.0], ['HILL', HILL.x, HILL.z, 1.7], ['TOWER', 25, -95, 1.4], ['HOME', 5, 75, 1.1]]) {
    const yaw = Math.atan2(-(tx - S.x), -(tz - S.z)); // toward the place
    const arm = new Group();
    arm.position.set(S.x, sy + h, S.z);
    arm.rotation.y = yaw;
    const board = cluster([-0.06, -0.1, -0.95], [0.06, 0.1, 0.05], 0.025, (g) => {
      g.fill([-0.04, -0.1, -0.95], [0.04, 0.1, 0.05], (px, py, pz) => pz > -0.75 || Math.abs(py) < 0.1 * ((pz + 0.95) / 0.2), WOOD); // a board with a pointed end
    });
    arm.add(board);
    for (const side of [-1, 1]) {
      const face = signFace(label, 0.7, 0.14);
      // Each face looks out of its side of the board; read from either side, the name runs left to right.
      face.position.set(side * 0.042, 0, -0.42);
      face.rotation.y = (side * Math.PI) / 2;
      arm.add(face);
    }
    extra.add(arm);
  }

  // ── Benches along the way ──
  for (const [bx, bz, yaw] of [[22.5, 40.5, -1.0], [74, -11, 2.3], [-24, 37, 0.6]]) {
    const by = blockHeight(bx, bz);
    const g = new VoxelGrid([-0.9, 0, -0.35], [0.9, 0.9, 0.35], 0.05);
    g.fillBox(-0.85, 0.4, -0.25, 0.85, 0.48, 0.2, WOOD);
    g.fillBox(-0.85, 0.55, 0.2, 0.85, 0.85, 0.25, WOOD);
    for (const lx of [-0.7, 0.65]) g.fillBox(lx, 0, -0.22, lx + 0.06, 0.85, 0.24, color('#3a3a44'));
    const m = voxelMesh(g);
    m.position.set(bx, by, bz);
    m.rotation.y = yaw;
    add(m);
    col.addCircle(bx, bz, 0.6);
  }

  const mesh = bake(parts);
  return {
    group: [mesh, extra],
    /** The windmill turns with the real wind; the boats rock on the water. */
    update(env, dt) {
      if (env.motion) sails.rotation.z -= dt * (0.15 + env.wind * 0.9);
      const t = env.t;
      b1.rotation.z = Math.sin(t * 0.9) * 0.025 * env.motion;
      b2.rotation.x = Math.sin(t * 0.8 + 1) * 0.03 * env.motion;
      b2.position.y = WATER_Y - 0.08 + Math.sin(t * 1.1) * 0.02 * env.motion;
    },
  };
}
