/* ============================================================================
   collision.js — minimal physics for walking. Pure: no three, no DOM.

   The player is an upright cylinder. Walls are 2-D segments and trees are 2-D
   circles, each with a vertical range so that a loft floor does not stop you
   walking under it. Floors you can stand on (porch, dock, bridge, loft, ladder,
   tower stairs) are "surfaces": boxes with a height, flat or sloped.

   There is no jumping, no falling damage and no death. You step up anything
   below STEP, and you drift down to whatever is beneath you.
   ========================================================================== */

export const PLAYER = { radius: 0.32, height: 1.7, eye: 1.6, step: 0.45 };

const CELL = 8;

export class Collision {
  /**
   * @param {object} o
   * @param {(x:number, z:number) => number}  o.ground   terrain height
   * @param {(x:number, z:number) => boolean} o.blocked  places nobody may stand (deep water, the rim)
   */
  constructor({ ground, blocked }) {
    this.ground = ground;
    this.blocked = blocked;
    this.segs = [];
    this.surfaces = [];
    this.grid = new Map(); // circles, bucketed: there are hundreds of trees
  }

  /** A circle (tree trunk, post). Returns it so a tier change can switch it off. */
  addCircle(x, z, r, y0 = -Infinity, y1 = Infinity) {
    const c = { x, z, r, y0, y1, on: true };
    const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push(c);
    return c;
  }

  /** A wall. Returns the segment so a door can switch it off. */
  addSeg(ax, az, bx, bz, y0 = -Infinity, y1 = Infinity) {
    const s = { ax, az, bx, bz, y0, y1, on: true };
    this.segs.push(s);
    return s;
  }

  /** Four walls around a box (furniture, a chimney). */
  addBox(x0, z0, x1, z1, y0, y1) {
    return [
      this.addSeg(x0, z0, x1, z0, y0, y1),
      this.addSeg(x1, z0, x1, z1, y0, y1),
      this.addSeg(x1, z1, x0, z1, y0, y1),
      this.addSeg(x0, z1, x0, z0, y0, y1),
    ];
  }

  /**
   * Something to stand on. `y` is a number, or a function (x, z) → height for
   * ramps and stairs. A surface also cancels `blocked` — it is how the dock
   * and the bridge cross water.
   */
  addSurface(x0, z0, x1, z1, y) {
    const s = { x0, z0, x1, z1, y: typeof y === 'function' ? y : () => y };
    this.surfaces.push(s);
    return s;
  }

  /** The highest thing under (x, z) that feet at `feetY` can step onto. */
  groundAt(x, z, feetY = Infinity) {
    let g = this.ground(x, z);
    let supported = false;
    for (const s of this.surfaces) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      const y = s.y(x, z);
      if (y <= feetY + PLAYER.step && y >= g) {
        g = y;
        supported = true;
      }
    }
    return { y: g, supported };
  }

  /** Can a player whose feet are at `feetY` stand at (x, z)? */
  canStand(x, z, feetY) {
    const g = this.groundAt(x, z, feetY);
    if (g.y > feetY + PLAYER.step) return false; // a cliff, not a step
    return g.supported || !this.blocked(x, z);
  }

  /** Push (x, z) out of every wall and trunk the body at feetY overlaps. */
  _resolve(p) {
    const R = PLAYER.radius;
    const lo = p.y + PLAYER.step; // things lower than a step are walked over, not into
    const hi = p.y + PLAYER.height;

    for (let pass = 0; pass < 3; pass++) {
      for (const s of this.segs) {
        if (!s.on || s.y1 <= lo || s.y0 >= hi) continue;
        const dx = s.bx - s.ax;
        const dz = s.bz - s.az;
        const len2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((p.x - s.ax) * dx + (p.z - s.az) * dz) / len2));
        const cx = s.ax + dx * t;
        const cz = s.az + dz * t;
        const ox = p.x - cx;
        const oz = p.z - cz;
        const d = Math.hypot(ox, oz);
        if (d < R) {
          // Exactly on the line: push along the wall's normal.
          const nx = d > 1e-6 ? ox / d : -dz / Math.sqrt(len2);
          const nz = d > 1e-6 ? oz / d : dx / Math.sqrt(len2);
          p.x = cx + nx * R;
          p.z = cz + nz * R;
        }
      }

      const gx = Math.floor(p.x / CELL);
      const gz = Math.floor(p.z / CELL);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const cell = this.grid.get(`${gx + i},${gz + j}`);
          if (!cell) continue;
          for (const c of cell) {
            if (!c.on || c.y1 <= lo || c.y0 >= hi) continue;
            const ox = p.x - c.x;
            const oz = p.z - c.z;
            const d = Math.hypot(ox, oz);
            const min = c.r + R;
            if (d < min && d > 1e-6) {
              p.x = c.x + (ox / d) * min;
              p.z = c.z + (oz / d) * min;
            }
          }
        }
      }
    }
  }

  /**
   * Move a player { x, y, z } by (dx, dz) on the ground plane. Mutates and
   * returns it; `y` is left at the feet height the caller should ease toward
   * (`p.groundY`), so stepping up is instant and stepping down is a drift.
   */
  move(p, dx, dz) {
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (PLAYER.radius * 0.5)));

    for (let i = 0; i < steps; i++) {
      const prev = { x: p.x, z: p.z };
      p.x += dx / steps;
      p.z += dz / steps;
      this._resolve(p);

      if (!this.canStand(p.x, p.z, p.y)) {
        // Slide: keep whichever axis is still allowed.
        if (this.canStand(p.x, prev.z, p.y)) p.z = prev.z;
        else if (this.canStand(prev.x, p.z, p.y)) p.x = prev.x;
        else {
          p.x = prev.x;
          p.z = prev.z;
        }
      }

      const g = this.groundAt(p.x, p.z, p.y).y;
      if (g > p.y) p.y = g; // stepped up
      p.groundY = g;
    }

    return p;
  }
}
