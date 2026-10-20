/* ============================================================================
   Layer.js — the contract every scene layer implements.

   Scene.js owns the loop and calls, in order: resize (on demand), update(env),
   draw(g, env). A layer NEVER reads the DOM, never touches another layer, and
   never allocates inside draw(). That's the whole discipline; everything else
   about the scene falls out of it.
   ========================================================================== */

export class Layer {
  /**
   * @param {object} opts
   * @param {number} opts.depth   Parallax factor. 0 = infinitely far (the sky
   *                              never moves), 1 = glued to the camera. The
   *                              foreground grass sits near 1.4 so it
   *                              over-travels, which is what sells the depth.
   * @param {string} opts.name    For debugging and per-layer profiling.
   */
  constructor({ depth = 0, name = 'layer' } = {}) {
    this.depth = depth;
    this.name = name;
    this.enabled = true;
  }

  /** Called on construction and on every resize. Rebuild cached canvases here. */
  resize(_W, _H, _env) {}

  /** Advance simulation. `env.dt` is already clamped — trust it. */
  update(_env) {}

  /** Paint. `g` is the low-res scene context; `env.glow` is the emissive one. */
  draw(_g, _env) {}

  /** Convenience: the parallax offset this layer should be drawn at. */
  ox(env) {
    return env.parallax.x * this.depth;
  }
  oy(env) {
    return env.parallax.y * this.depth;
  }
}
