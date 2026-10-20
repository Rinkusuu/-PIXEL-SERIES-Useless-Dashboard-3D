/* ============================================================================
   layout.js — where everything in the world is. Pure: no three, no DOM.

   This is horizon.js for a world with three dimensions: the one file allowed
   to know where the lake ends, where the path runs and how high the hill is.
   The terrain mesh, the grass, the trees, the collision and the water all ask
   here, so they cannot disagree — a tree cannot stand in the lake and the
   grass cannot grow on the path, because there is only one answer to "where".

   Units are metres. +x is east, −z is north, +y is up. The map is 250 × 250 m
   centred on the origin; the walkable part is a disc of radius WALK_RADIUS,
   and beyond it the land rises into a rim that fog and mountains swallow.
   ========================================================================== */

import { clamp, fbm2, lerp, smoothstep } from '../core/util.js';

/** smoothstep with edges, like GLSL: 0 below a, 1 above b (a > b runs backwards). */
export const sstep = (a, b, x) => smoothstep(clamp((x - a) / (b - a), 0, 1));

export const MAP_HALF = 125;
export const WALK_RADIUS = 112;
export const WATER_Y = 0;

/* ── Places ──────────────────────────────────────────────────────────────── */

export const LAKE = { x: -50, z: -40, rx: 60, rz: 55 };
export const ISLAND = { x: -62, z: -58, r: 9, h: 2.4 };
export const HILL = { x: 80, z: -20, r: 50, h: 14, top: 6 };

/* The cabin. Interior x ∈ [-1, 11], z ∈ [73.5, 82.5]; the door is in the north
   wall and the porch runs along it. FLOOR_Y is the floor's surface; the
   ground around it is levelled a step lower. */
export const CABIN = {
  x0: -1, x1: 11, z0: 73.5, z1: 82.5,
  floorY: 1.0,
  wallH: 3.0, // floor to eave
  ridgeY: 6.6, // absolute
  ridgeZ: 78, // the ridge runs east–west over this line
  loftY: 3.3, // loft floor surface, absolute; covers z ∈ [ridgeZ, z1]
  door: { x: 5, w: 1.2, h: 2.1 },
  porch: { z0: 69.5 }, // deck from z0 to the north wall
  groundY: 0.7,
  ladder: { x: 9.2, z0: 75.9, z1: 78.1, w: 0.8 },
};

export const DOCK = { x: -40, z0: 18, z1: -12, w: 2.6, y: 0.75 };
// yaw turns the deck to run along the path between its neighbouring waypoints.
export const BRIDGE = { x: 30, z: 22, len: 7, w: 2.2, yaw: Math.atan2(44 - 24, 10 - 32) };
export const TOWER = { x: 25, z: -95, size: 3.4, deck: 9, stairRun: 15 }; // deck height above the ground; one long south-facing stair

/* The fifteen panels' objects live in P3; these are the places they stand. */
export const SPOTS = {
  bed: { x: 2.2, z: 80.6 },
  mailbox: { x: -14, z: 64 },
  bench: { x: 9.5, z: 70.6 },
  stones: { x: -20, z: 10 },
  telescope: { x: HILL.x - 2, z: HILL.z + 2 },
  flatRock: { x: HILL.x + 3, z: HILL.z + 6 },
  leafTree: { x: 40, z: -62 },
};

/* The path from the porch to the hill crosses the stream at the bridge; a
   branch goes west past the mailbox to the dock. Polylines of [x, z]. */
export const PATHS = [
  [[5, 69], [12, 52], [24, 32], [BRIDGE.x, BRIDGE.z], [44, 10], [62, -4], [HILL.x - 3, HILL.z + 3]],
  [[4, 66], [-14, 61], [-28, 42], [DOCK.x, DOCK.z + 1]],
];

/* The stream: born on the hill's southern flank, under the bridge, into the
   lake's east shore. */
export const STREAM = [[68, 30], [52, 26], [BRIDGE.x, BRIDGE.z], [16, 13], [2, 5], [-12, 0]];
export const STREAM_HALF_WIDTH = 1.6;

/* ── Geometry helpers ────────────────────────────────────────────────────── */

/** Distance from (x, z) to segment a–b, and the parameter t along it. */
export function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
  return { d: Math.hypot(x - (ax + dx * t), z - (az + dz * t)), t };
}

/** Distance to a polyline, plus the fraction along its whole length. */
export function lineDist(x, z, pts) {
  let best = { d: Infinity, u: 0 };
  let run = 0;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const seg = Math.hypot(bx - ax, bz - az);
    const { d, t } = segDist(x, z, ax, az, bx, bz);
    if (d < best.d) best = { d, u: (run + seg * t) / total };
    run += seg;
  }
  return best;
}

export const pathDist = (x, z) => Math.min(...PATHS.map((p) => lineDist(x, z, p).d));

/** 0 at the lake's centre, 1 on its nominal shore. */
export const lakeE = (x, z) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);

const inCabinPad = (x, z, pad) =>
  x > CABIN.x0 - pad && x < CABIN.x1 + pad && z > CABIN.porch.z0 - pad && z < CABIN.z1 + pad;

/* ── The ground ──────────────────────────────────────────────────────────── */

/** The land before the stream is cut into it. */
function landHeight(x, z) {
  // Gentle rolling ground.
  let h = 0.7 + (fbm2(x * 0.018, z * 0.018, 3, 7) - 0.5) * 2.2;

  // The hill, with a small flat top for the telescope.
  const dh = Math.hypot(x - HILL.x, z - HILL.z);
  const hill = 1 - sstep(HILL.top / HILL.r, 1, dh / HILL.r);
  h += HILL.h * Math.pow(hill, 1.4);

  // The tower stands on a knoll in the forest.
  const dt = Math.hypot(x - TOWER.x, z - TOWER.z);
  h += 2.2 * (1 - sstep(0, 18, dt));

  // The rim: past the walkable disc the land lifts a little and the forest
  // closes in. Capped, so the square map's corners don't tower over everything.
  const r = Math.hypot(x, z);
  h += Math.min(6, Math.max(0, r - WALK_RADIUS + 4) * 0.3);

  // The lake basin.
  const e = lakeE(x, z);
  h = lerp(h, -3.2, sstep(1.08, 0.72, e));

  // The island rises out of it.
  const di = Math.hypot(x - ISLAND.x, z - ISLAND.z) / ISLAND.r;
  if (di < 1.4) h = Math.max(h, ISLAND.h * (1 - di * di) + 0.1 * (1 - di));

  // Level ground around the cabin.
  if (inCabinPad(x, z, 8)) {
    const k = inCabinPad(x, z, 2) ? 1 : 1 - sstep(2, 8, padDistance(x, z));
    h = lerp(h, CABIN.groundY, k);
  }

  return h;
}

function padDistance(x, z) {
  const dx = Math.max(CABIN.x0 - x, 0, x - CABIN.x1);
  const dz = Math.max(CABIN.porch.z0 - z, 0, z - CABIN.z1);
  return Math.hypot(dx, dz);
}

/** The stream's water surface at a fraction u along it: down the hill to the lake. */
export function streamSurfaceAt(u) {
  const [sx, sz] = STREAM[0];
  return lerp(landHeight(sx, sz) - 0.6, WATER_Y + 0.05, sstep(0, 1, u));
}

/** Terrain height. The single source of truth for "where is the ground". */
export function heightAt(x, z) {
  let h = landHeight(x, z);

  // Paths are worn a little into the ground.
  const p = pathDist(x, z);
  if (p < 2) h -= 0.12 * (1 - p / 2);

  // The stream cuts a bed below its own surface.
  const s = lineDist(x, z, STREAM);
  if (s.d < STREAM_HALF_WIDTH + 2.5) {
    const bed = streamSurfaceAt(s.u) - 0.45;
    const k = 1 - sstep(STREAM_HALF_WIDTH * 0.6, STREAM_HALF_WIDTH + 2.5, s.d);
    h = lerp(h, Math.min(h, bed), k);
  }

  return h;
}

/* ── Lamp posts ──────────────────────────────────────────────────────────────
   Every LAMP_EVERY metres along each path, a step to its side, never in water
   and never on the path itself. Computed once; props.js builds them and
   lights.js lights the nearest few. */
const LAMP_EVERY = 16;

function placeLamps() {
  const out = [];
  PATHS.forEach((pts, p) => {
    let carry = LAMP_EVERY * 0.5;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = carry; d < len; d += LAMP_EVERY) {
        const t = d / len;
        const side = (out.length + p) % 2 ? 1.6 : -1.6; // alternate sides
        const x = ax + (bx - ax) * t + ((bz - az) / len) * side;
        const z = az + (bz - az) * t - ((bx - ax) / len) * side;
        if (!isWater(x, z) && pathDist(x, z) > 1.1) out.push({ x, z });
      }
      carry = (carry - len) % LAMP_EVERY;
      if (carry < 0) carry += LAMP_EVERY;
    }
  });
  return out;
}

/* ── The ground as blocks ───────────────────────────────────────────────────
   The terrain is drawn as columns: BLOCK metres across, heights rounded to
   STEP. Everything that stands on the ground (the player's feet, trees, grass,
   props) asks blockHeight, so nothing floats above a step or sinks into one. */
export const BLOCK = 0.5;
export const STEP = 0.25;

/** The top of the ground column containing (x, z). */
export function blockHeight(x, z) {
  const cx = (Math.floor(x / BLOCK) + 0.5) * BLOCK;
  const cz = (Math.floor(z / BLOCK) + 0.5) * BLOCK;
  return Math.round(heightAt(cx, cz) / STEP) * STEP;
}

/* ── What a place is ─────────────────────────────────────────────────────── */

/** Water you cannot walk into: the lake, and the stream away from the bridge. */
export function isWater(x, z) {
  if (heightAt(x, z) < WATER_Y - 0.25 && lakeE(x, z) < 1.15) return true;
  return lineDist(x, z, STREAM).d < STREAM_HALF_WIDTH * 0.9;
}

/** 0–1: how much forest wants to grow here. */
export function forestDensity(x, z) {
  const r = Math.hypot(x, z);
  if (lakeE(x, z) < 1.12) return 0;
  if (r > WALK_RADIUS + 4) return 0.95; // beyond the walkable disc: a wall of trees into the fog
  if (pathDist(x, z) < 4) return 0;
  if (lineDist(x, z, STREAM).d < 4) return 0;
  if (inCabinPad(x, z, 18)) return 0;
  if (Math.hypot(x - HILL.x, z - HILL.z) < 22) return 0;
  if (Math.hypot(x - TOWER.x, z - TOWER.z) < 7 || segDist(x, z, TOWER.x, TOWER.z, TOWER.x, TOWER.z + TOWER.stairRun + 4).d < 4) return 0;
  if (Math.hypot(x - SPOTS.leafTree.x, z - SPOTS.leafTree.z) < 7) return 0;

  const north = sstep(-25, -65, z); // the forest proper
  const rim = sstep(88, 108, r); // trees thicken toward the edge
  const scatter = 0.2 * Math.max(0, fbm2(x * 0.05, z * 0.05, 2, 3) - 0.62); // the odd tree in the meadow, in a few clumps
  return clamp(Math.max(north * 0.85, rim * 0.7) + scatter, 0, 1);
}

/** 0–1: how thick the meadow grass grows here. */
export function grassDensity(x, z) {
  if (lakeE(x, z) < 1.04) return 0;
  if (Math.hypot(x, z) > WALK_RADIUS + 2) return 0;
  if (pathDist(x, z) < 1.1) return 0;
  if (lineDist(x, z, STREAM).d < STREAM_HALF_WIDTH + 0.4) return 0;
  if (inCabinPad(x, z, 0.5)) return 0;
  const shade = forestDensity(x, z);
  return clamp(1 - shade * 1.4, 0, 1) * (0.55 + 0.45 * fbm2(x * 0.04, z * 0.04, 2, 11));
}

export const LAMPS = placeLamps();
