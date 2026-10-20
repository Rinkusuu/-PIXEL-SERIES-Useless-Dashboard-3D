/* ============================================================================
   lights.js — the palette, turned into light.

   One key light casts shadows: the sun while it is up, the moon after it sets.
   It stands at the body's REAL position (sky3d computes it), so shadows point
   where they would in your garden today. A hemisphere light takes the sky's
   middle band from above and the land colour from below. And three warm point
   lights live in and around the cabin — the hearth (always), the table lamp
   and the porch lantern (once it gets dark). After dark the lamp posts along
   the paths light up too; a small pool of PointLights is handed, once a
   second, to the posts nearest you, so a dozen lamps cost six lights.
   ========================================================================== */

import { Color, DirectionalLight, HemisphereLight, Object3D, PointLight } from 'three';
import { linear } from './renderer.js';
import { CABIN, LAMPS } from './layout.js';
import { clamp, mixRgb } from '../core/util.js';

export class Lights {
  constructor() {
    this.key = new DirectionalLight(0xffffff, 1);
    this.key.castShadow = true;
    const cam = this.key.shadow.camera;
    cam.left = cam.bottom = -42;
    cam.right = cam.top = 42;
    cam.near = 1;
    cam.far = 260;
    this.key.shadow.bias = -0.0015;
    this.key.shadow.normalBias = 0.04;
    this.target = new Object3D();
    this.key.target = this.target;

    this.hemi = new HemisphereLight(0xffffff, 0x444444, 1);

    const f = CABIN.floorY;
    this.hearth = new PointLight(0xff9a4a, 0, 10, 1.6);
    this.hearth.position.set(CABIN.x1 - 0.9, f + 0.6, 77);
    this.lamp = new PointLight(0xffcf7a, 0, 9, 1.6);
    this.lamp.position.set(5, f + 2.3, 76.6);
    this.lantern = new PointLight(0xffcf7a, 0, 9, 1.6);
    this.lantern.position.set(CABIN.door.x + 1.2, f + 2.2, CABIN.z0 - 0.4);
    this.posts = Array.from({ length: 6 }, () => new PointLight(0xffcf7a, 0, 14, 1.6));
    this.points = [this.hearth, this.lamp, this.lantern, ...this.posts];
    this._assign = 0;

    this._c = new Color();
  }

  addTo(scene) {
    scene.add(this.key, this.target, this.hemi, ...this.points);
  }

  /** How many point lights the tier can afford (they stay in the scene; off is intensity 0). */
  setPoints(n) {
    this.pointBudget = n;
  }

  setShadowSize(size) {
    if (!size) return;
    if (this.key.shadow.mapSize.x !== size) {
      this.key.shadow.mapSize.set(size, size);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
  }

  /**
   * @param {object} env     env.state
   * @param {Sky}    sky     for the bodies' directions and altitudes
   * @param {Vector3} focus  where the shadow camera should centre (the player)
   */
  update(env, sky, focus) {
    const { pal } = env;

    // Sun by day; the moon (fainter, cooler, and only if it is up) by night.
    const sunUp = clamp((sky.sunAlt + 2) / 10, 0, 1);
    const moonUp = clamp((sky.moonAlt + 2) / 10, 0, 1) * (1 - sunUp);
    const useSun = sunUp > 0 || moonUp === 0;
    const dir = useSun ? sky.sunDir : sky.moonDir;

    this.target.position.copy(focus);
    this.key.position.copy(focus).addScaledVector(dir, 120);
    if (useSun) {
      linear(mixRgb(pal.sun, pal.glow, 0.35), this.key.color);
      this.key.intensity = 3.2 * sunUp * (0.35 + pal.lum * 0.65);
    } else {
      // Moonlight scales with how much moon there is.
      const lit = 1 - Math.abs(sky.moonPhase - 0.5) * 2;
      linear(mixRgb([150, 170, 230], pal.glow, 0.2), this.key.color);
      this.key.intensity = 0.55 * moonUp * (0.25 + 0.75 * lit);
    }

    // The sky's colour, half-desaturated: full-strength blue from above turned
    // every wooden floor indoors green, and the quantiser finished the job.
    const mid = pal.sky[1];
    const grey = 0.2126 * mid[0] + 0.7152 * mid[1] + 0.0722 * mid[2];
    linear(mixRgb(mid, [grey, grey, grey], 0.5), this.hemi.color);
    // Light bounced up from the ground is warm earth, not lawn: a green floor-bounce made every wall khaki.
    linear(mixRgb(pal.land, [138, 106, 80], 0.6), this.hemi.groundColor);
    this.hemi.intensity = 0.9 + pal.lum * 1.9;

    // The cabin's lights. The hearth always burns; it is just harder to see at noon.
    const dark = clamp(1 - pal.lum * 1.4, 0, 1);
    const flicker = 0.85 + 0.15 * Math.sin(env.t * 7.3) * Math.sin(env.t * 3.1 + 1.7) * (env.motion ? 1 : 0.3);
    this.hearth.intensity = (6 + 10 * dark) * flicker;
    this.lamp.intensity = this.pointBudget >= 2 ? 9 * dark : 0;
    this.lantern.intensity = this.pointBudget >= 3 ? 8 * dark : 0;

    // The nearest posts get the pool, re-dealt once a second (they don't move; you do).
    this._assign -= env.dt;
    if (this._assign <= 0) {
      this._assign = 1;
      const near = [...LAMPS].sort((a, b) => Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z));
      this.posts.forEach((l, i) => near[i] && l.position.set(near[i].x, near[i].y, near[i].z));
    }
    const postBudget = Math.max(0, this.pointBudget - 3);
    this.posts.forEach((l, i) => (l.intensity = i < postBudget ? 12 * dark : 0));
    this.dark = dark;
  }

  /** The lights the volumetric pass should glow around: whichever are lit. */
  airLamps() {
    return this.points.filter((l) => l.intensity > 0.5);
  }
}
