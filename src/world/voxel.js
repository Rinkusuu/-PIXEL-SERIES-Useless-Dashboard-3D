/* ============================================================================
   voxel.js — the world is made of small cubes, and this is where they become
   triangles.

   A VoxelGrid is a box of cells in world space; each cell holds a palette
   index (0 = empty). Things are built by filling boxes and shapes, exactly as
   a carpenter would cut them, and the voxel IS the pixel: the grain of a log
   or a plank is a run of slightly different cubes, not a texture.

   mesh() turns a grid into one BufferGeometry: only faces that touch air,
   merged greedily into the largest same-colour rectangles, each vertex
   darkened by its neighbours (voxel ambient occlusion — the soft contact
   shadow in every corner that makes voxel art read as solid). One model, one
   draw call, however many cubes.
   ========================================================================== */

import { BufferAttribute, BufferGeometry, Color } from 'three';
import { hash, noise2 } from '../core/util.js';

/* ── The shared palette ────────────────────────────────────────────────────
   Index 0 is air. Every base colour gets SHADES consecutive entries (itself,
   a little darker, a little lighter) so a surface can have grain while still
   merging into long runs wherever the grain agrees. Colours are stored
   linear, ready for the vertex colour attribute. */
const SHADES = 3;
const palette = [[0, 0, 0]];
const byHex = new Map();
const c = new Color();

/** The palette index of a hex colour's base shade. */
export function color(hex) {
  if (byHex.has(hex)) return byHex.get(hex);
  const base = palette.length;
  if (base + SHADES > 256) throw new Error('voxel palette is full');
  for (const k of [1, 0.88, 1.1]) {
    c.set(hex).multiplyScalar(k);
    palette.push([c.r, c.g, c.b]);
  }
  byHex.set(hex, base);
  return base;
}

/* ── Paints: what colour a filled cell gets ─────────────────────────────── */

const shade = (base, n) => base + (n < 0.33 ? 1 : n > 0.72 ? 2 : 0);

/** One colour, with a speckle of grain. */
export const grain = (hex, amount = 0.5) => {
  const b = color(hex);
  return (i, j, k) => shade(b, 0.5 + (((hash(`${i},${j},${k}`) % 1000) / 1000) - 0.5) * amount * 2);
};

/** Horizontal courses, as in a log wall: each course a shade, seams darker. */
export const courses = (hex, height = 3) => {
  const b = color(hex);
  return (i, j, k) => (j % height === 0 ? b + 1 : shade(b, noise2(i * 0.15 + Math.floor(j / height) * 7.3, k * 0.15, 3)));
};

/** Planks running along x (axis 0) or z (axis 2), a few voxels wide. */
export const planks = (hex, axis = 0, width = 2) => {
  const b = color(hex);
  return (i, j, k) => {
    const across = axis === 0 ? k : i;
    const along = axis === 0 ? i : k;
    if (across % width === 0 && hash(`${along >> 3},${across}`) % 3 === 0) return b + 1;
    return shade(b, ((hash(`p${Math.floor(across / width)}`) % 100) / 100) * 0.8 + noise2(along * 0.2, across, 5) * 0.2);
  };
};

/** Stone blocks with darker mortar lines. */
export const blocks = (hex) => {
  const b = color(hex);
  return (i, j, k) => {
    const row = Math.floor(j / 2);
    const off = row % 2 ? 2 : 0;
    if (j % 2 === 0 || (i + off) % 4 === 0 || (k + off) % 4 === 0) return b + 1;
    return shade(b, ((hash(`s${(i + off) >> 2},${row},${(k + off) >> 2}`) % 100) / 100));
  };
};

const solid = (p) => (typeof p === 'function' ? p : () => p);

/* ── The grid ──────────────────────────────────────────────────────────── */

export class VoxelGrid {
  /**
   * @param {number[]} min    world-space [x, y, z] of the grid's low corner
   * @param {number[]} max    world-space high corner
   * @param {number}   size   edge length of one voxel, in metres
   */
  constructor(min, max, size = 0.1) {
    this.size = size;
    this.origin = min;
    this.dims = [0, 1, 2].map((a) => Math.max(1, Math.ceil((max[a] - min[a]) / size - 1e-6)));
    this.cells = new Uint8Array(this.dims[0] * this.dims[1] * this.dims[2]);
  }

  _i(i, j, k) {
    return i + this.dims[0] * (j + this.dims[1] * k);
  }

  get(i, j, k) {
    const [nx, ny, nz] = this.dims;
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return 0;
    return this.cells[this._i(i, j, k)];
  }

  set(i, j, k, v) {
    const [nx, ny, nz] = this.dims;
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return;
    this.cells[this._i(i, j, k)] = v;
  }

  /** World coordinate → cell index along an axis (rounded, so boxes snap to the grid). */
  cell(a, w) {
    return Math.round((w - this.origin[a]) / this.size);
  }

  /** Fill (or with paint 0, carve) every cell whose centre lies in the world box. */
  fillBox(x0, y0, z0, x1, y1, z1, paint) {
    const p = solid(paint);
    const lo = [this.cell(0, Math.min(x0, x1)), this.cell(1, Math.min(y0, y1)), this.cell(2, Math.min(z0, z1))];
    const hi = [this.cell(0, Math.max(x0, x1)), this.cell(1, Math.max(y0, y1)), this.cell(2, Math.max(z0, z1))];
    // Anything thinner than a voxel still gets one: a rail must not vanish.
    for (let a = 0; a < 3; a++) if (hi[a] === lo[a]) hi[a] = lo[a] + 1;
    for (let k = lo[2]; k < hi[2]; k++) for (let j = lo[1]; j < hi[1]; j++) for (let i = lo[0]; i < hi[0]; i++) this.set(i, j, k, p(i, j, k));
  }

  /** Fill every cell in a world box whose centre passes test(x, y, z). For slopes, gables, round things. */
  fill(min, max, test, paint) {
    const p = solid(paint);
    const s = this.size;
    const [ox, oy, oz] = this.origin;
    const lo = [0, 1, 2].map((a) => Math.max(0, Math.floor((min[a] - this.origin[a]) / s)));
    const hi = [0, 1, 2].map((a) => Math.min(this.dims[a], Math.ceil((max[a] - this.origin[a]) / s)));
    for (let k = lo[2]; k < hi[2]; k++) {
      for (let j = lo[1]; j < hi[1]; j++) {
        for (let i = lo[0]; i < hi[0]; i++) {
          if (test(ox + (i + 0.5) * s, oy + (j + 0.5) * s, oz + (k + 0.5) * s)) this.set(i, j, k, p(i, j, k));
        }
      }
    }
  }
}

/* ── Meshing ────────────────────────────────────────────────────────────── */

// Ambient occlusion per corner: 0 (both sides blocked) … 3 (open), as brightness.
const AO = [0.5, 0.68, 0.84, 1];

/**
 * Greedy-mesh a grid into one non-indexed BufferGeometry (position, normal,
 * color). Faces merge only when colour AND all four corner AO values agree,
 * so the occlusion stays exact on merged quads.
 */
export function mesh(grid) {
  const { dims, size } = grid;
  const [ox, oy, oz] = grid.origin;
  const solidAt = (p) => (grid.get(p[0], p[1], p[2]) ? 1 : 0);
  const pos = [];
  const nor = [];
  const col = [];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const mask = new Int32Array(dims[u] * dims[v]);
    const x = [0, 0, 0];
    const L = [0, 0, 0];

    for (const s of [1, -1]) {
      for (x[d] = 0; x[d] < dims[d]; x[d]++) {
        // 1. Which faces in this slice touch air, and how occluded are their corners?
        let n = 0;
        for (x[v] = 0; x[v] < dims[v]; x[v]++) {
          for (x[u] = 0; x[u] < dims[u]; x[u]++, n++) {
            const a = grid.get(x[0], x[1], x[2]);
            L[0] = x[0];
            L[1] = x[1];
            L[2] = x[2];
            L[d] += s;
            if (!a || solidAt(L)) {
              mask[n] = 0;
              continue;
            }
            let ao = 0;
            const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
            for (let q = 0; q < 4; q++) {
              const [du, dv] = corners[q];
              L[u] += du;
              const s1 = solidAt(L);
              L[u] -= du;
              L[v] += dv;
              const s2 = solidAt(L);
              L[u] += du;
              const cc = solidAt(L);
              L[u] -= du;
              L[v] -= dv;
              const occ = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
              ao |= occ << (q * 2);
            }
            mask[n] = a | (ao << 8);
          }
        }

        // 2. Merge into rectangles and emit them.
        n = 0;
        for (let j = 0; j < dims[v]; j++) {
          for (let i = 0; i < dims[u]; ) {
            const key = mask[n];
            if (!key) {
              i++;
              n++;
              continue;
            }
            let w = 1;
            while (i + w < dims[u] && mask[n + w] === key) w++;
            let h = 1;
            grow: while (j + h < dims[v]) {
              for (let k = 0; k < w; k++) if (mask[n + k + h * dims[u]] !== key) break grow;
              h++;
            }

            const plane = s > 0 ? x[d] + 1 : x[d];
            const corner = (cu, cv) => {
              const p = [0, 0, 0];
              p[d] = plane;
              p[u] = cu;
              p[v] = cv;
              return [ox + p[0] * size, oy + p[1] * size, oz + p[2] * size];
            };
            const P = [corner(i, j), corner(i + w, j), corner(i + w, j + h), corner(i, j + h)];
            const ao = [0, 1, 2, 3].map((q) => (key >> (8 + q * 2)) & 3);
            const rgb = palette[key & 255];
            const normal = [0, 0, 0];
            normal[d] = s;

            // Split along the diagonal that keeps occlusion gradients smooth.
            const flip = ao[0] + ao[2] < ao[1] + ao[3];
            let order = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
            if (s < 0) order = [order[0], order[2], order[1], order[3], order[5], order[4]];
            for (const q of order) {
              pos.push(...P[q]);
              nor.push(...normal);
              const k = AO[ao[q]];
              col.push(rgb[0] * k, rgb[1] * k, rgb[2] * k);
            }

            for (let hh = 0; hh < h; hh++) for (let ww = 0; ww < w; ww++) mask[n + ww + hh * dims[u]] = 0;
            i += w;
            n += w;
          }
        }
      }
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeBoundingSphere();
  return g;
}
